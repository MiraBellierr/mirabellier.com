# Arena — Balance & Design Improvements

Fresh review of the Arena game against the code as it stands today (2026-09-07), after the
fixes from the 2026-06-28 audit in `TODO.md` landed (loss XP, `MAX_COMBINED_DAMAGE_MULTIPLIER`,
equipment enhancement + substat reroll, streak coin multiplier, 44% evasion cap, inventory
quantity cap, max-level XP→coin overflow, synthetic NPC gear/skill scaling, leaderboard XP
formula). **Nothing already marked fixed there is repeated here.** Everything below is a
current-state finding with the file and line it lives at.

Ordered by impact on how the game actually plays.

---

## 1. Consumables are permanent, not consumable — ✅ DONE (2026-09-07)

> Implemented: durations cut to the `*_BOOST_FIGHT_DURATION` / `ONE_SHOT_SAVE_CHARGES`
> constants (now the source of truth, wired into `TIER_CONFIG`), tier prices
> repriced down with a per-item override (ascension kept at 120k), and
> `EFFECT_DURATION_LIMITS` given entries for every combat effect field so legacy
> stockpiles clamp down on load. Docs + tests updated. Needs an admin compensation
> pass on deploy. (The price table, then `CRAFT_COIN_COSTS`, is now
> `CONSUMABLE_TIER_PRICES` after the §11 recipe removal.)

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

## 2. Tier unlock levels are dead code — every consumable is craftable at level 1 — ✅ DONE (2026-09-07)

> Implemented: added `TIER_UNLOCK_LEVELS` (Rookie 1 / Bronze 8 / Silver 16 / Gold 28
> / Mythic 42 / Cosmic 58), wired into the consumable item's `unlockLevel`.
> `buyShopItem` enforces the level (throws `ARENA_ITEM_LOCKED`). Shop UI shows
> "Unlocks at level N". Tests updated. (The recipe layer was later removed
> entirely — see §11 — so consumables are now level-gated coin purchases.)

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

## 3. Defenders fight for free — their consumable charges are never spent — ✅ DONE (2026-09-07)

> Implemented direction A: `simulateFight` now returns `oppEffectUsage`, and a shared
> `spendDefenderEffectUsage(db, defenderUserId, oppEffectUsage, now)` helper applies it to
> the PvP defender's stored effects (via `applyFightEffectUsage`) in both `runFight` and
> `finalizePlaybackFightRewards`. NPC opponents have no row and are skipped; a defender with
> nothing active takes no write. Tests: the old "not consumed" test is flipped, plus new
> direct-fight and no-op coverage.

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

## 4. Being attacked has no upside, and attacking has no downside — ✅ DONE (2026-09-07)

> All three sub-parts landed:
> - **Defender pay:** `settleDefenderFight` credits a flat stipend
>   `floor((10 + defenderLevel*2) * (defenderWon ? 1.5 : 1))` in the fight tx and drops a
>   display-only `defense_reward` inbox notification (`DEFENDER_*` constants in `combat.js`).
> - **Defensive W/L:** new `arena_profiles.defensiveWins` / `defensiveLosses` columns
>   (`ensureColumn`), incremented per PvP defence, surfaced on the profile payload, the
>   `Arena` profile card, and the win-rate leaderboard row.
> - **NPC nerf:** NPC XP + coin deltas are scaled by `NPC_REWARD_SCALE` (0.75) in both
>   `runFight` and `finalizePlaybackFightRewards`.
>
> Needs an admin compensation pass on deploy (this shifts live coin income).

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

## 5. The skill tree has no build diversity, and 24 points go nowhere — ✅ DONE (2026-09-07)

> Went with **budget it, hard**: `earnedPoints = floor(level * SKILL_POINTS_PER_LEVEL)`
> (`0.5`) → 35 points for 45 nodes at cap, so ~10 nodes are a genuine cross-chain choice.
> Respec raised to `level * 300` (21k at cap) and gated behind a 3-day cooldown
> (`SKILL_RESET_COOLDOWN_MS`, new `arena_profiles.lastSkillResetAt` column,
> `ARENA_SKILL_RESET_COOLDOWN` error with `cooldownEndsAt`/`retryAfterMs`). Payload +
> `ArenaSkillTree` UI carry `resetOnCooldown` / `resetCooldownEndsAt`. Tree extension
> (tier-4 capstones, keystones, paragon) is left for a future pass. Needs a compensation
> pass on deploy — every current tree over 35 nodes is clipped on next load.

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

## 6. The coin curve is inverted: brutal early, meaningless late — ✅ DONE (2026-09-07)

> All four levers landed:
> - **Level-scaled sinks:** `getGearRollPrice(level) = 250 + level*22` and
>   `getRerollSubStatCost(level) = floor(gearRollPrice * 0.5)` replace the flat 1000 / 500.
>   `buildShopCatalog`, `buyShopItem` and `rerollEquipmentSubStat` charge the live value;
>   the profile payload carries `gearRollPrice` / `rerollSubStatCost` and the shop/inventory
>   UI reads them.
> - **Investment-scaled fodder refund:** `getFodderRefund(slot, enhLevel, playerLevel)` =
>   `40%` of the roll price + `40%` of `getEnhancementCoinsSunk(enhLevel)`, floored at 150.
> - **Income tweak:** `calculateWinCoins` → `18 + floor(oppLevel*3.5) + floor(oppLevel^1.15) + rarityCoinReward`.
> - **Endgame coin sink:** a cosmetic **title shop** (`lib/arena/titles.js`, `TITLE_CATALOG`
>   25k–15M coins, `arena_titles` table + `arena_profiles.activeTitleId`). Titles are
>   stat-free; the active one shows on the profile, leaderboard, and fight-opponent snapshot.
>   `GET/POST /arena/shop/titles[/buy|/activate]`.
>
> Needs a compensation pass on deploy (gear now costs more at high level).

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

## 7. Coins and cards move between accounts with zero friction — ✅ DONE (2026-09-07)

> All four levers landed (`lib/arena/market.js` + `lib/arena/trade.js`, constants in
> `lib/arena/_constants.js`):
> - **Sale/trade commission** — `MARKET_SALE_COMMISSION_RATE` 7%, **burned** (leaves the coin
>   supply). Applies to completed market sales and to coins moved in a direct trade: payer pays
>   full, receiver nets `amount - round(amount * rate)`.
> - **Non-refundable listing fee** — `max(round(price * MARKET_LISTING_FEE_RATE), MARKET_LISTING_FEE_MIN)`
>   (2%, min 100), charged at listing creation, never returned. On the response as `listingFee`.
> - **Comparable-sales price ceiling** — `min(round(getMarketPrice.value * MARKET_PRICE_CEILING_MULTIPLIER), MARKET_MAX_PRICE)`
>   (4×), `ARENA_MARKET_PRICE_TOO_HIGH`; the price guide exposes `maxListingPrice`.
> - **Level gate** — `ARENA_TRADE_MIN_LEVEL` 10 on create/buy listing + create/send/accept trade
>   (`ARENA_TRADE_LEVEL_LOCKED`).
>
> Needs a compensation pass on deploy (the level gate locks out sub-10 accounts mid-trade).

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

## 8. Equipment: the main stat is a fifth substat, and rolls are one-and-done luck — ✅ DONE (2026-09-07)

> Full rework — all four suggestions plus set bonuses:
> - **Slot main-stat identity:** weapon `dmgPct` 6–14, armor `defendPct` 8–18, charm
>   `critRate`|`critDmg` (unchanged). A slot's main stat is excluded from its own sub-stat pool.
> - **Enhancement main scaling:** `round(rolled * (1 + level * 0.10))` (2.5× at +15), not flat +1.
> - **Enhancement sub-stat ticks:** +3/+6/+9/+12/+15 permanently boost one random sub-stat line
>   by `round(midpoint * 0.30)` (stored in a new `subStatBonuses` column, apart from the roll).
> - **`rerollKeepHigherCharges`** is now read by `rerollEquipmentSubStat` — with a charge it keeps
>   `max(old, rolled)` and decrements.
> - **Set bonuses:** `EQUIPMENT_SETS` (Berserker/Sentinel/Trickster), random `setId` per roll, 2/3-piece
>   pct bonuses in `computeEquipmentStats` + `equipmentSets` on the payload + inventory UI.
> - New `arena_equipment_pieces.setId` / `subStatBonuses` columns; a one-time migration remaps
>   legacy flat `power`/`guard` mains to `dmgPct`/`defendPct`. NPC pct stats bumped for parity.
> - Needs a compensation pass on deploy (existing pieces are remapped and lose the old flat-main
>   contribution).

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

## 9. Stat design: speed does everything, effectHit does almost nothing — ✅ DONE (2026-09-07)

> All five parts:
> - **effectHit always-on:** attacker `effectHit` shaves the defender's evade chance
>   (`EFFECT_HIT_ACCURACY_PER_POINT` 0.0006/pt) and adds a flat true-damage trickle
>   (`EFFECT_HIT_TRUE_DAMAGE_PER_POINT` 0.15/pt) to every hit — pays in neutral fights now.
> - **Turn order:** speed jitter band 4 → `TURN_ORDER_SPEED_JITTER` 18 (near-equal speed = coin
>   flip); the fighter acting **second** in an exchange gets `+SECOND_ACTOR_DAMAGE_PCT` (10) to
>   its `attackerDamagePct` that hit.
> - **Element chart:** `ELEMENT_EFFECTIVENESS` widened to 2 strengths / 2 weaknesses / 1 neutral
>   per element (super-effective ~33% vs ~17%), symmetric. Frontend `ELEMENT_STRONG_AGAINST` /
>   weakness chart updated.
>   - **Follow-up (2026-09-07): renamed elements → "Combat Styles".** Fire→Might, Water→Swift,
>     Earth→Ward, Wind→Ruse, Light→Surge, Dark→Skill. Matchups rebuilt on fighting-game logic
>     (Swift outspeeds Might; Skill reads Swift; Might breaks Skill; etc.) — see the table in
>     `docs/arena-combat.md` § "Style Multiplier". `ELEMENTS` / `ELEMENT_EFFECTIVENESS` keep their
>     code identifiers; only the string values changed. Data migrated by
>     `mirabellier-backend/scripts/migrate-elements-to-styles.cjs` (big catalog JSON) +
>     `migrateElementsToStyles(db)` in `lib/db.js` (stored card JSON). TCG shares these constants
>     and was updated in lockstep.
> - **Super-effective crit penalty dropped** (`calculateAttackOutcome` no longer halves crit on
>   element advantage).
> - **`computeElementMultiplier` fixed** to scale from its `baseElementMult` argument instead of
>   a hardcoded `1.3`.
>
> `computeMaxHp` (speed's HP contribution) left as-is — out of the chosen scope.

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

## 10. XP to 70 is ~14,000 fights, and levels 46–70 give nothing but stats — ✅ DONE (2026-09-07)

> Progression-curve pass (the systemic bullets — extra equipment slot at 50, second consumable
> slot at 60, keystone choice at 70, paragon overflow track — need new subsystems + schema + UI
> and are left for a future pass, same as §5 deferred keystones/paragon):
> - **XP curve flattened:** `xpToNext = 80 + round(18 · level^1.85)` (was `80 + 25·level²`).
>   Total 1→70 drops **2,802,895 → 1,127,707 XP**.
> - **Per-fight win XP raised:** `calculateWinXp` opponent term `floor(level·2.5)` → `floor(level·4)`,
>   so a top-end win pays ~296 base XP. Combined with the curve, 1→70 is **~3,800 best-case fights**
>   (down from ~14,150) — in the suggested 3,000–4,000 band.
> - **Streak XP bonus is now multiplicative:** `calculateStreakXpBonus` (flat `+7` cap, additive)
>   replaced by `calculateStreakXpMultiplier` = `1 + min(streak·0.02, 0.25)` — mirrors
>   `calculateStreakCoinMultiplier` so the two streak systems read the same way.
> - **Levels 46–70 give something beyond stats:** `earnedSkillPoints` grants a **+1 milestone
>   skill point at level 50 / 60 / 70** (`SKILL_POINT_MILESTONE_LEVELS`). Cap total 35 → 38 of 45
>   nodes — deliberately nudges §5's 35/45 budget but stays short of lighting the whole tree.
> - **Leaderboard:** the inline `80 + 25·p.level·p.level` SQL in 4 queries is gone; `xpProgress`
>   is derived in JS from the shared `xpToNext` (SQLite can't do fractional powers), and the
>   `level` board's tiebreak sorts by `p.xp DESC` instead.
> - **`runFight` response** now carries `rewards.xpRoundsWon` (1–3) so clients can show the
>   fast-finish bonus and reward tests don't depend on turn-count RNG. Frontend `shared.ts` typed.
>
> `xpRoundsWon` (fast-fight XP credit) and the max-level 1 XP = 1 coin overflow floor were left
> as-is — the paragon track is the real answer to overflow and it's deferred. Needs an admin
> compensation pass on deploy via `lib/arena/compensation.js` (every existing sub-70 profile's XP
> total now maps to a higher effective level; level-50+ players are owed milestone skill points).

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

> **Partial pass — ✅ DONE (2026-09-07):** the stat-asymmetry bug, `first_attack_double`,
> affinity scaling, the `crit`/`critRate` alias, and the doc drift are fixed (details on each
> bullet). Left open: the round-system decision (a real either/or redesign, not a small item)
> and `resetDailyOpponentCount` (deliberate — see the bullet).
>
> Deploy notes: `migrateCritSubStatAlias` runs once on boot (idempotent). The affinity rework
> is a small live power buff for anyone with built-up affinity — no compensation pass needed,
> but worth a changelog line; `first_attack_double` becoming reliable is likewise a buff.

- **`calculateRoundPower` is effectively dead** (`combat.js:60`). It's exported and tested but
  never called by the fight path — combat is pure HP attrition now. `resolveRoundWinner` survives
  only as a tiebreaker. The `playerRoundsWon`/`opponentRoundsWon` values in the response are
  always 1/0 (`:2109-2110`), and `score` in the API payload is vestigial. Either delete the round
  system or restore best-of-N rounds as a real mechanic.
  - **Deferred:** deleting `score` is a breaking API/frontend change and best-of-N is a mechanic
    redesign — neither is a "smaller item". `resolveRoundWinner` is a live tiebreaker (double-KO,
    60-turn timeout) and stays. `rewards.xpRoundsWon` (added in §10) is the one round-ish value
    that now does something.
- ✅ **DONE (2026-09-07)** — the recipe abstraction was dropped entirely. Consumables are now
  a plain coin purchase via `buyShopItem` / `POST /arena/shop/buy` (`item.price` from
  `CONSUMABLE_TIER_PRICES`); `SHOP_RECIPES`/`buildRecipes`/`craftShopRecipe`/`/shop/craft` and
  the `recipes[]` payload array are gone, along with `craftArenaRecipe` and `ArenaShopRecipe`
  on the frontend. `rollFightMaterialRewards()` (still `[]`) and the round system below remain.
- **Player/opponent stat application is asymmetric.** Consumable boosts adjust both
  `playerTotalStats` **and** `playerBaseStats` for the player (`:1329-1379`) but only
  `opponent.totalStats` for the opponent (`:1408-1450`). Since `baseStats` feeds `computeMaxHp`,
  a buffed player gets extra max HP from `stat_steroid`/`guard_boost` that a buffed opponent does
  not. Attacker-favouring bug in the mirror logic.
  - **✅ DONE (2026-09-07):** the HP path was already symmetric (`computeMaxHp` reads
    `*.totalStats` for both sides, changed in §9), so the described bug was gone — but
    `playerBaseStats` was still cloned and mutated by every player buff block and then **never
    read**. Removed the dead clone + 11 mutation lines; the player buff blocks are now
    byte-for-byte mirrors of the opponent ones (only `*.totalStats`).
- **`first_attack_double` is a coin flip.** It only fires on `turnCounter === 1` (`:1745`), so it
  does nothing whenever the opponent wins the speed roll — but the charge isn't consumed either,
  which at least makes it non-punishing. Consider "your first attack of the fight" instead of
  "turn 1 of the fight".
  - **✅ DONE (2026-09-07):** now gated on `playerHasLandedAttack` / `opponentHasLandedAttack` —
    each side's **first landed hit** is doubled regardless of turn order; the charge is spent
    only when it actually applies. New test `first_attack_double fires on the player's first hit
    even when they act second`.
- **Affinity is too small to notice.** 250 fights on one card yields +2 power / +1 guard / +1
  speed / +1 effectHit (`cards.js:16-17,161`) against level-70 stats of ~150. It costs a huge
  commitment and returns ~1%. Either scale it meaningfully (percentage-based, or unlock a card
  passive at max affinity) or drop the thresholds so it's a pleasant early-game nudge instead.
  - **✅ DONE (2026-09-07):** thresholds pulled in `[10,25,60,120,250] → [6,18,45,100,190]`;
    each level now grants `AFFINITY_STAT_STEP = 3` (was 1) on the cycling stat, so a maxed card
    is +6 power / +3 / +3 / +3. Crucially it is now applied as a **direct** stat bonus on the
    snapshot (its own `affinity` line in `baseStats`/`totalStats`/`stats.total`) instead of
    being folded into the card-IV bonus and divided by 3 — that ÷3 is what made the old bonus
    invisible. Frontend stat-source labels dropped the now-wrong "IV" wording.
- **`resetDailyOpponentCount(db, current.userId)` on every fight** (`combat.js:2316`) is
  deliberate per the 2026-06-28 notes, but the practical effect is that an actively-fighting
  player can be selected as a defender an unbounded number of times per day. Combined with §4
  (defenders earn nothing) the most active players carry the most ELO risk for no reward.
  - **Deferred:** §4 (defender rewards) is done, which removes the "no reward" half. Capping
    defender selection is a matchmaking change with its own trade-offs — out of scope for a
    smaller-items pass.
- **Sub-stat naming is still split** — `SUB_STAT_POOL` emits `critRate`, `computeEquipmentStats`
  handles both `crit` and `critRate` (`equipment.js:550-551`), and `normalizeSubStatType` maps
  `crit → critRate` (`:53`). Legacy rows only; worth a migration to retire the alias.
  - **✅ DONE (2026-09-07):** `migrateCritSubStatAlias(db)` rewrites `mainStatType = 'crit'` and
    `"type":"crit"` inside `arena_equipment_pieces.subStats` once (idempotent). `normalizeSubStatType`
    and the `case "crit":` fall-through are gone — call sites use the type verbatim.
- **`docs/arena-combat.md` drift.** Two claims no longer match the code: the element formula
  (§9) and "Boost durations decrement per fight, not only on wins" — `consumeFightBoostDurations`
  (`combat.js:463`) does run on both branches now, but it only covers exp/coin/draw boosts;
  combat-effect durations decrement through `applyFightEffectUsage` and only when the effect
  actually fired. Worth restating precisely.
  - **✅ DONE (2026-09-07):** the element table was restated in §9/§10; the Consumable Stacking
    Rules section now spells out the two decrement paths, plus a new **Card Affinity** section
    and a first-landed-hit note on first-attack doubling.

---

## Suggested order of work

**First — correctness and fairness (small diffs, large effect):**
1. ✅ Return and apply `oppEffectUsage` (§3).
2. ✅ Wire `TIER_UNLOCK_LEVELS` into shop items and recipes (§2).
3. ✅ Fix the `baseStats` asymmetry for opponent buffs (§11) — HP path was already symmetric;
   removed the dead `playerBaseStats` mutations that made it look asymmetric.
4. ✅ Fix `computeElementMultiplier` to use its `baseElementMult` argument (§9).

**Second — the balance pass that changes the game most:**
5. ✅ Consumable durations and pricing, using the three dead duration constants (§1).
6. ✅ Market commission + listing fee + comparable-sales price bound (§7).
7. ✅ Defender rewards (§4).

**Also done:** §5 (skill point budget + respec cooldown), §6 (coin curve — level-scaled sinks + fodder refund + income tweak + cosmetic title shop).

**Third — depth:**
8. ✅ Skill point budget or tree extension (§5).
9. ✅ Equipment main-stat identity, enhancement payoff, `rerollKeepHigher`, set bonuses (§8).
10. XP curve and level 46–70 content (§10).
11. ✅ `effectHit` rework and element table widening (§9).

Steps 1–4 are contained enough to ship with tests against the existing
`mirabellier-backend/test/arena-service.test.js` suite. Steps 5–7 change live player balances and
want a compensation pass through `lib/arena/compensation.js` — which already exists for exactly
this purpose.
