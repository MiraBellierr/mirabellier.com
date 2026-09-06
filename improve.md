# Arena — Balance & Design Improvements

Fresh review of the Arena game against the code as it stands today (2026-09-07), after the
fixes from the 2026-06-28 audit in `TODO.md` landed (loss XP, `MAX_COMBINED_DAMAGE_MULTIPLIER`,
equipment enhancement + substat reroll, streak coin multiplier, 44% evasion cap, inventory
quantity cap, max-level XP→coin overflow, synthetic NPC gear/skill scaling, leaderboard XP
formula). **Nothing already marked fixed there is repeated here.** Everything below is a
current-state finding with the file and line it lives at.

Ordered by impact on how the game actually plays.

---

## 1. Consumables are permanent, not consumable

**Where:** `mirabellier-backend/lib/arena-constants.js:110-317` (`TIER_CONFIG`), `:342` (`CRAFT_COIN_COSTS`)

Every consumable ships with a duration between **250 and 1000 fights**:

| Item | Effect | Duration | Craft cost | Cost per fight |
|---|---|---|---|---|
| Berserker's Brew (Rookie) | +20% damage | 500 fights | 200 | **0.4 coins** |
| Sage's Tome (Bronze) | +100% XP | 250 fights | 800 | 3.2 coins |
| Phoenix Feather (Silver) | Death save | 500 charges | 3,200 | 6.4 coins |
| Seeker Lens (Gold) | +20% crit | 500 fights | 10,000 | 20 coins |
| Vampiric Fang (Mythic) | 20% lifesteal | 1000 fights | 36,000 | 36 coins |
| Chrono Vial (Cosmic) | KO revive at 50% HP | 1000 charges | 120,000 | 120 coins |

A win at level 70 pays ~501 coins (`combat.js:228`). The single most expensive consumable in
the game costs **1/4 of one win per fight it covers**. `MAX_ACTIVE_CONSUMABLE_EFFECTS = 4` is
the only thing limiting a player, and once those four slots are filled they stay filled for
weeks of play. There is no ongoing decision, no resource pressure, and no reason to ever craft
a second item of the same type.

The tuned constants for this — `ECONOMY_BOOST_FIGHT_DURATION = 20`,
`DEFENSIVE_BOOST_FIGHT_DURATION = 8`, `RARITY_BOOST_FIGHT_DURATION = 3`
(`arena-constants.js:57-59`) — are **defined and exported but referenced nowhere in the
codebase.** They look like the intended balance that got replaced by the 250–1000 values.

**Suggested:**
- Cut durations by 1–2 orders of magnitude: economy boosts ~20 fights, defensive ~8–10,
  offensive ~10–15, one-shot saves (`death_save`, `self_revive`, `first_attack_double`)
  to 1–3 charges. Wire the three dead constants back in as the source of truth.
- Re-price so a full 4-slot loadout costs roughly **one play session's coin income**, not
  0.02% of it. That turns consumables into the endgame coin sink the economy currently lacks
  (see §6).
- Add `EFFECT_DURATION_LIMITS` entries for the combat kinds. Today only 7 keys are capped
  (`_constants.js:82-90`); `damageBoostFightsRemaining`, `statSteroidFightsRemaining`,
  `vampiricHealFightsRemaining`, `selfReviveCharges` etc. fall through to
  `Number.MAX_SAFE_INTEGER` in `clampEffectDuration` (`effects.js:31`).

---

## 2. Tier unlock levels are dead code — every consumable is craftable at level 1

**Where:** `arena-constants.js:320` (`TIER_UNLOCK_LEVELS`), `:329` and `:351` (`unlockLevel: 1`)

`TIER_CONFIG` assigns Bronze=8, Silver=16, Gold=28, Mythic=42, Cosmic=58. `TIER_UNLOCK_LEVELS`
is built from those and exported — and then **`grep` finds zero consumers.** Both
`normalizeConsumableItem` and `buildRecipes` hardcode `unlockLevel: 1`, so the only checks that
exist (`shop.js:203`, `:277`, `:344`) always pass.

Coins are therefore the sole gate on Cosmic-tier power. Since coins transfer freely between
accounts (§7), a brand-new level-1 alt can be handed 170k coins and immediately run the full
endgame consumable loadout.

**Suggested:** feed `TIER_UNLOCK_LEVELS[tier]` into both the item and recipe `unlockLevel`.
One-line fix, restores the whole intended progression ladder.

---

## 3. Defenders fight for free — their consumable charges are never spent

**Where:** `combat.js:1302` (`oppEffectUsage` built), `:2094-2121` (return omits it), `runFight` `:2124-2340`

`simulateFight` tracks the defender's effect usage in `oppEffectUsage` across ~20 assignment
sites, then **never returns it** — the return object at `:2094` carries only `effectUsage`.
`runFight` and `playback.js` consequently only ever call `applyFightEffectUsage` for the
attacker.

Consequences:
- A defender's `death_save`, `self_revive`, `first_attack_double`, `match_rarity`,
  `iv_boost` and `first_hit_true_damage` charges are **infinite while defending**. Only the
  attacker pays.
- The JSDoc at `:1233` already promises `oppEffectUsage` in the return type, so this reads as
  an unfinished implementation rather than a deliberate rule.

**Suggested:** either return `oppEffectUsage` and apply it to the defender's stored effects, or
— probably better for an idle game — deliberately give defenders a *reduced* passive loadout
(stats and passives, no charge-based consumables) and document that. The current state is the
worst of both: full power, zero cost.

---

## 4. Being attacked has no upside, and attacking has no downside

**Where:** `combat.js:2124-2340` (`runFight`)

When you are picked as someone's opponent:
- You gain no XP, no coins, no win/loss record, no streak movement.
- Your ELO moves (`applyEloResult`, `:1047`).
- You spend nothing (§3).

So defence is pure rating downside. Meanwhile the attacker chooses nothing — `selectOpponentForFight`
(`:1195`) picks for them — and NPC fallbacks are **unrated** (`elo.rated: false` at `:2295`),
meaning a player in a thin matchmaking pool farms full XP and coins at zero rating risk while a
player in a dense pool eats ELO variance for identical rewards.

**Suggested:**
- Pay defenders something on a successful defence: a flat coin stipend, or a "defence log"
  with accumulated rewards claimable from the inbox. This also gives the `ArenaInbox` page a
  reason to exist for non-traders.
- Track defensive W/L separately and surface it on the profile and leaderboard.
- Either rate NPC fights at a reduced K-factor, or scale NPC XP/coin rewards down ~20–30% so
  PvP is the efficient path. Right now NPCs are both safer *and* weaker
  (`statScale` 0.75–0.98, `NPC_TEMPLATES` `:25-33`).

---

## 5. The skill tree has no build diversity, and 24 points go nowhere

**Where:** `mirabellier-backend/lib/arena-skill-tree.js` (3 branches × 3 chains × 5 nodes = 45 nodes),
`lib/arena/skill-tree.js:28` (`earnedPoints = level - 1`)

At level 70 a player has **69 points for 45 nodes**. Every node is a strict gain with no
opportunity cost, so every level-70 player converges on the identical fully-allocated tree, and
points 46–69 are simply discarded. Respec costs `level * 100` = 7,000 coins max
(`skill-tree.js:30`), i.e. 14 wins — there's no commitment either.

The tree is currently a level-gated stat drip, not a choice.

**Suggested (pick one direction):**
- **Budget it.** Cut earned points to ~`floor(level * 0.65)` (≈45 at cap) so the last tier of
  one chain genuinely costs another chain's capstone.
- **Or extend it.** Add a 4th tier of capstones (9 more nodes) plus mutually-exclusive keystone
  choices at the end of each chain, and let surplus points feed a paragon track.
- Either way, raise respec cost or add a cooldown so builds mean something week to week.

---

## 6. The coin curve is inverted: brutal early, meaningless late

**Where:** `combat.js:228` (`calculateWinCoins`), `equipment.js:87` (`getEnhancementCoinCost`), `:97` (`getFodderRefund`)

Income scales linearly with opponent level (`18 + oppLevel * 5`), every sink is flat:

| | Level 5 player | Level 70 player |
|---|---|---|
| Coins per win | ~50 | ~501 |
| Gear roll (1,000) | 20 wins | 2 wins |
| Substat reroll (500) | 10 wins | 1 win |
| Fodder refund | 500 | 500 |
| Full +15 enhance (204k coins + 15 fodder pieces ≈ 219k) | unreachable | ~440 wins |
| Apex Sigil (120,000) | unreachable | ~240 wins |

At ~12 fights/minute (`FIGHT_COOLDOWN_MS = 5000`) a capped player earns ~6,000 coins/minute and
runs out of things to buy in a couple of hours. A new player spends their first several hours
unable to afford a second gear roll. The 2,000-coin tutorial milestones at levels 5/8/12/16/20
(`combat.js:2216`) are a patch over this, not a curve.

**Suggested:**
- Make income sublinear and sinks superlinear: e.g. coins `18 + oppLevel * 5` →
  `18 + oppLevel * 3.5 + floor(oppLevel^1.15)`, and scale gear-roll / reroll price with the
  player's level so a roll stays worth ~5–8 wins at every level.
- `getFodderRefund` returns a flat `price / 2` regardless of the piece's enhancement level or
  substat quality — scrapping a +12 piece refunds the same 500 coins as scrapping a fresh roll.
  Refund should scale with invested coins, or enhancement should be transferable.
- Add endgame sinks with real depth: gear sets, a cosmetic/title shop, guild or seasonal buy-ins.

---

## 7. Coins and cards move between accounts with zero friction

**Where:** `lib/arena/market.js` (no fee/tax anywhere — `grep -i "fee\|tax\|commission"` is empty),
`_constants.js:33` (`MARKET_MAX_PRICE = 1_000_000`), `lib/arena/trade.js`

The market has no listing fee, no sale commission, and no price sanity check beyond the 1M cap.
Direct trade has no coin component restrictions. Combined with §2 (no level gate on power) this
means:
- Two accounts can move 1M coins per listing with a junk C-rarity card as the vehicle.
- A fresh alt is endgame-ready the moment someone funds it.
- There is **no coin sink in the entire player-to-player economy** — the only faucet-drain is
  the shop, so the total money supply only grows.

**Suggested:** a 5–10% sale commission burned on completion, a small non-refundable listing fee,
and a price ceiling derived from `MARKET_SALES_SAMPLE_SIZE` recent comparable sales (the sales
sampling infrastructure at `_constants.js:36` already exists — it just isn't used to bound
prices). Gate market/trade access behind a level threshold.

---

## 8. Equipment: the main stat is a fifth substat, and rolls are one-and-done luck

**Where:** `arena-constants.js:75-113` (`ROLLABLE_EQUIPMENT`, `SUB_STAT_POOL`), `equipment.js:459` (`rollEquipmentPiece`), `:529` (main stat +1 per enhancement level)

- Weapon main stat is `power 1–10`. The `power` **substat** is also `1–10`. The main stat is
  mechanically indistinguishable from one of the four substats, so a "Blade" is just five random
  substats where one happens to be power. Slot identity doesn't exist.
- Enhancement adds a flat **+1 to the main stat per level** (`equipment.js:529`). +15 on a weapon
  is +15 power — after 204k coins and 15 sacrificed pieces. Meanwhile a single lucky `hp` substat
  roll is worth 30–50 points. Enhancement is a coin sink, not a progression system.
- Substat variance is still 2:1 on most lines and 3.3:1 on `critDmg [15,50]`, with no roll
  quality tiers and no pity. `rerollEquipmentSubStat` (`:216`) rerolls into the *same* full range,
  so a good roll can be destroyed and there is no "keep higher" option — even though
  `rerollKeepHigherCharges` exists in the effect system (`_constants.js:85`) and is capped at 4.
- Charms roll `critRate 5–25` **or** `critDmg 10–60`; three maxed charm-ish pieces can stack
  `critChancePct` past the 95% clamp in `calculateAttackOutcome:750`, wasting the excess silently.

**Suggested:**
- Give each slot a main-stat pool that substats *can't* roll (e.g. weapon: `dmgPct`; armor:
  `defendPct`/`hpPct`; charm: `critRate`/`critDmg`), and make enhancement scale the main stat
  by a percentage of its rolled value, not +1 flat.
- Make enhancement levels also upgrade one random substat every 3 levels (the standard
  gacha-gear loop). That gives the 204k coins a payoff worth chasing.
- Wire `rerollKeepHigherCharges` into `rerollEquipmentSubStat` — the field exists and is
  normalized but no code path reads it.
- Add set bonuses (2/3-piece) so slots interact.

---

## 9. Stat design: speed does everything, effectHit does almost nothing

**Where:** `combat.js:598` (`computeMaxHp`), `:662` (`computeEvasionChance`), `:698` (`calculateAttackOutcome`), `:1993` (turn order)

Per point of stat, at level 70:

| Stat | Contributions |
|---|---|
| **Speed** | +0.7 attack roll, +0.35 defense roll, +0.8 max HP, evasion (0.159%/pt gap), **turn order** |
| Power | +1.8 attack roll, +0.8 max HP |
| Guard | −0.88 damage taken (1.6 × 0.55), +1.0 max HP |
| EffectHit | element multiplier (**only on 1-in-6 matchups**), shield pierce (`floor(eh/10)`%) |

Speed is the only stat that touches all five systems, and turn order is decisive: at level 70 a
typical hit is ~197 damage against ~1005 max HP, so fights last ~5–10 turns and striking first is
worth roughly half a hit's advantage per exchange.

`effectHit`, by contrast, is dead weight in **5 of 6 element matchups**. The `ELEMENT_EFFECTIVENESS`
table (`arena-constants.js:44-51`) gives each element exactly one strength and one weakness, so a
random pairing is super-effective 16.7% of the time. Card IVs then divide it by 3
(`cards.js:604`), and shield pierce only matters against the handful of shield consumables.

Two smaller oddities in the same code:
- **Super-effective hits have their crit chance halved** (`combat.js:757`). Element advantage
  *reduces* your crit rate — an unintuitive interaction that punishes the matchup you wanted.
- `computeElementMultiplier` (`:618`) **ignores its `baseElementMult` argument** and hardcodes
  `1.3` as the base. Latent today because every >1 entry is 1.3, but it silently contradicts
  `docs/arena-combat.md` ("effective = base + …") and will break the moment a 1.5× matchup is added.

**Suggested:**
- Move turn order off raw speed onto `speed + rand` with a **tighter random band relative to
  stat scale** (currently `randomInt(0,4)` vs speeds near 80 — effectively deterministic), or
  give the slower fighter a compensating bonus (e.g. +10% damage when acting second).
- Give `effectHit` an always-on role: accuracy vs. evasion, passive-trigger chance, or a small
  flat true-damage component. Something that pays in the 83% of fights where elements are neutral.
- Widen the element table (2 strengths / 2 weaknesses per element) so matchups matter more often.
- Drop the super-effective crit penalty, and fix `computeElementMultiplier` to actually use its
  `baseElementMult` parameter.

---

## 10. XP to 70 is ~14,000 fights, and levels 46–70 give nothing but stats

**Where:** `lib/arena/utils.js:161` (`xpToNext = 80 + 25·level²`), `combat.js:186` (`calculateWinXp`)

- Total XP for 1→70: **2,802,895**. The last level alone is 119,105.
- A win against a level-70 opponent pays ~198 XP. That is **~14,156 fights**, or ~20 hours of
  uninterrupted 5-second-cooldown play at best-case rewards — and far more in practice since
  early-game opponents pay far less.
- The streak XP bonus caps at `log2(6) * 3` = **+7 XP** (`:170`). At ~198 XP/fight that's 3.5%,
  effectively invisible; the streak *coin* multiplier (+30%) is 8× more meaningful, so the two
  streak systems pull in different directions.
- `xpRoundsWon = clamp(4 - ceil(turns/6), 1, 3)` (`:2078`) rewards fast fights with at most
  **+4 XP** over a slow one. Not enough to influence any build decision.
- Skill points stop mattering at level 46 (§5), so levels 46–70 deliver only flat stat gains.

**Suggested:**
- Flatten the curve to something like `80 + 18·level^1.85` and raise per-fight XP with opponent
  level, targeting ~3,000–4,000 fights to cap.
- Make the streak XP bonus multiplicative (e.g. `+2% per win, cap +25%`) so it's readable
  alongside the coin multiplier.
- Give levels 46–70 something: an extra equipment slot at 50, a second consumable slot at 60,
  a keystone skill choice at 70.
- Max-level overflow at 1 XP = 1 coin (`:149`) is a floor, not a progression — a paragon track
  spending overflow XP on small permanent bonuses would give the cap a reason to exist.

---

## 11. Smaller items

- **`calculateRoundPower` is effectively dead** (`combat.js:60`). It's exported and tested but
  never called by the fight path — combat is pure HP attrition now. `resolveRoundWinner` survives
  only as a tiebreaker. The `playerRoundsWon`/`opponentRoundsWon` values in the response are
  always 1/0 (`:2109-2110`), and `score` in the API payload is vestigial. Either delete the round
  system or restore best-of-N rounds as a real mechanic.
- **`rollFightMaterialRewards()` returns `[]`** (`combat.js:587`) and every recipe emits
  `inputs: []` (`arena-constants.js:354`). Crafting is a pure coin transaction with a "recipe"
  wrapper around it. Either bring materials back as a fight-drop loop, or drop the recipe
  abstraction entirely.
- **Player/opponent stat application is asymmetric.** Consumable boosts adjust both
  `playerTotalStats` **and** `playerBaseStats` for the player (`:1329-1379`) but only
  `opponent.totalStats` for the opponent (`:1408-1450`). Since `baseStats` feeds `computeMaxHp`,
  a buffed player gets extra max HP from `stat_steroid`/`guard_boost` that a buffed opponent does
  not. Attacker-favouring bug in the mirror logic.
- **`first_attack_double` is a coin flip.** It only fires on `turnCounter === 1` (`:1745`), so it
  does nothing whenever the opponent wins the speed roll — but the charge isn't consumed either,
  which at least makes it non-punishing. Consider "your first attack of the fight" instead of
  "turn 1 of the fight".
- **Affinity is too small to notice.** 250 fights on one card yields +2 power / +1 guard / +1
  speed / +1 effectHit (`cards.js:16-17,161`) against level-70 stats of ~150. It costs a huge
  commitment and returns ~1%. Either scale it meaningfully (percentage-based, or unlock a card
  passive at max affinity) or drop the thresholds so it's a pleasant early-game nudge instead.
- **`resetDailyOpponentCount(db, current.userId)` on every fight** (`combat.js:2316`) is
  deliberate per the 2026-06-28 notes, but the practical effect is that an actively-fighting
  player can be selected as a defender an unbounded number of times per day. Combined with §4
  (defenders earn nothing) the most active players carry the most ELO risk for no reward.
- **Sub-stat naming is still split** — `SUB_STAT_POOL` emits `critRate`, `computeEquipmentStats`
  handles both `crit` and `critRate` (`equipment.js:550-551`), and `normalizeSubStatType` maps
  `crit → critRate` (`:53`). Legacy rows only; worth a migration to retire the alias.
- **`docs/arena-combat.md` drift.** Two claims no longer match the code: the element formula
  (§9) and "Boost durations decrement per fight, not only on wins" — `consumeFightBoostDurations`
  (`combat.js:463`) does run on both branches now, but it only covers exp/coin/draw boosts;
  combat-effect durations decrement through `applyFightEffectUsage` and only when the effect
  actually fired. Worth restating precisely.

---

## Suggested order of work

**First — correctness and fairness (small diffs, large effect):**
1. Return and apply `oppEffectUsage` (§3).
2. Wire `TIER_UNLOCK_LEVELS` into shop items and recipes (§2).
3. Fix the `baseStats` asymmetry for opponent buffs (§11).
4. Fix `computeElementMultiplier` to use its `baseElementMult` argument (§9).

**Second — the balance pass that changes the game most:**
5. Consumable durations and pricing, using the three dead duration constants (§1).
6. Market commission + listing fee + comparable-sales price bound (§7).
7. Defender rewards (§4).

**Third — depth:**
8. Skill point budget or tree extension (§5).
9. Equipment main-stat identity, enhancement payoff, `rerollKeepHigher` (§8).
10. XP curve and level 46–70 content (§10).
11. `effectHit` rework and element table widening (§9).

Steps 1–4 are contained enough to ship with tests against the existing
`mirabellier-backend/test/arena-service.test.js` suite. Steps 5–7 change live player balances and
want a compensation pass through `lib/arena/compensation.js` — which already exists for exactly
this purpose.
