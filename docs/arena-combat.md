# Arena Combat Formulas

This document is the quick reference for Arena combat math and balance caps.

## Core Stats

Fighters use these combat stats:

- `hp`: base health before guard, speed, power, and equipment percentage bonuses.
- `power`: primary attack stat.
- `guard`: primary defense stat and a smaller health contributor.
- `speed`: action ordering, evasion, and some passive scaling.
- `effectHit`: element scaling and shield pierce.

## Max HP

`computeMaxHp(stats, hpPct)`:

```txt
base = hp + guard * 1.0 + (power + speed) * 0.8
maxHp = floor(base * (1 + hpPct / 100))
```

`hpPct` comes from equipment percentage stats. Profile displays should include it when showing total HP.

## Action Order

Each turn pair checks who acts first:

```txt
playerScore = playerSpeed + randomInt(0, 18)
opponentScore = opponentSpeed + randomInt(0, 18)
player acts first when playerScore >= opponentScore
```

The jitter band (`TURN_ORDER_SPEED_JITTER`, was 4) is wide enough that near-equal
speeds are a real coin-flip. The fighter that acts **second** in an exchange gets
`+SECOND_ACTOR_DAMAGE_PCT` (10) added to its `attackerDamagePct` for that hit, so
striking first is a tempo edge rather than a decisive one (improve.md §9).

The fight ends when a combatant reaches 0 HP or when 60 attacks have been recorded.

## Evasion

`computeEvasionChance(attackerStats, defenderStats, extraDefenderEvasionPct)`:

```txt
speedGap = defenderSpeed - attackerSpeed
chance = 0.03 + speedGap * 0.00159
         - attackerEffectHit * EFFECT_HIT_ACCURACY_PER_POINT   (0.0006)
         + extraDefenderEvasionPct / 100
chance is clamped to 0.02 through 0.44
```

The attacker's `effectHit` is a hit rating — it shaves the defender's evade
chance in every fight (improve.md §9). Consumable and passive evasion are passed
as `extraDefenderEvasionPct`. The live combat cap is 44%, even if an active
effect stores a larger raw value.

## Attack Damage

`calculateAttackOutcome` first checks evasion. If the defender evades, damage is 0.

For landed attacks:

```txt
rarityPower = rarity.powerBonus * (1 + attackerLevel * 0.02)
attackRoll = power * 1.8 + speed * 0.7 + rarityPower + randomInt(-6, 12)
defenseRoll = guard * 1.6 + speed * 0.35 + defenderRarityPower + randomInt(-4, 8)

damage = max(1, floor(attackRoll - defenseRoll * 0.55))
damage += attackerDamageFlat
damageBase = max(1, damage)
damage = floor(damage * (1 + attackerDamagePct / 100))
```

Critical chance:

```txt
critChance = clamp(0.05 + bonusCritChancePct / 100, 0.05, 0.95)
```

Element advantage no longer affects crit chance (the old super-effective halving
is gone — improve.md §9). A crit multiplies damage by `baseCritMultiplier`, which
is usually `1 + equipmentCritDmgPct / 100`.

Defense reductions then apply:

```txt
damage = floor(damage / (1 + defenderDamageReductionPct / 100))
damage -= defenderDamageReductionFlat
damage = max(1, damage)
```

True damage is tracked separately and added after the main combined multiplier
cap. Every hit also carries a small `effectHit`-scaled true-damage trickle:
`floor(attackerEffectHit * EFFECT_HIT_TRUE_DAMAGE_PER_POINT)` (0.15/pt), on top of
any consumable/passive true damage.

## Style Multiplier

The card affinity trait is six **combat styles** — Might, Swift, Skill, Ruse,
Surge, Ward — not elements. (`ELEMENTS` / `ELEMENT_EFFECTIVENESS` keep their code
names to avoid a churny rename across every call site; the values are the styles.)

`ELEMENT_EFFECTIVENESS` gives each style **2 strengths (1.3×), 2 weaknesses
(0.7×), and 1 neutral matchup**, so a random pairing is super-effective ~33% of
the time (was ~17%). Every `A>B` pairs with `B<A`. The chart reads from the
fighting-game logic behind each name:

| Style | beats | loses to | neutral |
|---|---|---|---|
| Might | Skill, Surge | Swift, Ruse  | Ward  |
| Swift | Might, Ruse  | Skill, Ward  | Surge |
| Skill | Swift, Ward  | Might, Surge | Ruse  |
| Ruse  | Might, Surge | Swift, Ward  | Skill |
| Surge | Skill, Ward  | Might, Ruse  | Swift |
| Ward  | Swift, Ruse  | Skill, Surge | Might |

Read as "A beats B because…": Might breaks **Skill**'s form with raw force and
overpowers a **Surge** burst; Swift outspeeds **Might** and closes on **Ruse**
before the trick lands; Skill reads **Swift**'s rush and picks apart a turtling
**Ward**; Ruse baits **Might** into overcommitting and punishes a telegraphed
**Surge**; Surge overwhelms **Skill**'s precision and cracks **Ward**'s guard;
Ward weathers **Swift**'s flurry and shrugs off **Ruse**'s gimmicks.

Style matchup starts from `ELEMENT_EFFECTIVENESS[attackerElement][defenderElement]`.
When the base multiplier is greater than 1, `computeElementMultiplier` scales it by
`effectHit` — from the **base value passed in**, not a hardcoded 1.3:

```txt
effective = clamp(base + attackerEffectHit * 0.02 - defenderEffectHit * 0.01, 1.0, 1.8)
```

Defensive passives can reduce element effectiveness before the cap is applied.

`effectHit` also pierces shields:

```txt
shieldPiercePct = floor(effectHit / 10)
```

## Passive Timing

Passives run at these triggers:

- `onFightStart`: before attacks begin. Used for shields and startup effects.
- `onAttack`: before attack damage is calculated. Used for flat damage, damage percent, crit chance, and speed scaling.
- `onDamageTaken`: after a landed attack is known, before final HP loss. Used for reductions, temp guard, heals, reflect, counters, critical cancel, and element mitigation.
- `onDamageDealt`: after reductions are known, before the combined damage cap. Used for extra strikes and post-hit damage scaling.

Each passive action can define `chancePct` and `maxTriggersPerFight`. `doublePassiveTrigger` doubles passive chance, clamped to 100%.

## Combined Damage Cap

After element, criticals, attack percent, first-attack doubling, passives, and reductions
(first-attack doubling from `first_attack_double` applies to each side's **first landed
hit of the fight**, not literally turn 1 — improve.md §11):

```txt
finalDamage <= floor(damageBase * MAX_COMBINED_DAMAGE_MULTIPLIER)
```

`MAX_COMBINED_DAMAGE_MULTIPLIER` is 5. True damage is added after this cap because it is a separate fixed-damage mechanic.

## Shields

Shields absorb final damage before HP loss. Shield pierce from `effectHit` is applied first:

```txt
pierced = floor(finalDamage * shieldPiercePct / 100)
shieldDamage = finalDamage - pierced
shield absorbs shieldDamage
hp takes pierced plus any unabsorbed damage
```

## Revives

Phoenix Feather (`deathSave`) takes priority when both revive effects are available:

1. If HP reaches 0 and `deathSaveCharges > 0`, the defender survives at 1 HP.
2. If HP is still 0 and `selfReviveCharges > 0`, Chrono Vial restores:

```txt
reviveHp = ceil(maxHp * selfReviveHpThresholdPct / 100)
```

Chrono Vial is a KO revive, not a mid-fight heal at threshold.

## Rewards

XP to advance from a level: `xpToNext = 80 + round(18 * level^1.85)` — a sub-quadratic
curve totalling ~1.13M XP for 1→70 (~3.8k best-case fights), down from the old
`80 + 25 * level²` / ~2.8M / ~14k (improve.md §10).

Win XP:

```txt
base = 10 + floor(opponentLevel * 4) + roundsWon * 2
winXp = floor(base * streakXpMultiplier)
```

`roundsWon` is `clamp(4 - ceil(turns / 6), 1, 3)` — a fast finish credits more; it is
returned to the client as `rewards.xpRoundsWon`.

Streak XP multiplier (same shape as the coin multiplier, so both streak systems read
the same way):

```txt
1 + min(winStreak * 0.02, 0.25)
```

Loss XP:

```txt
max(1, floor(winXp * 0.35))
```

Win coins:

```txt
base = 18 + floor(opponentLevel * 3.5) + floor(opponentLevel ^ 1.15) + rarityCoinReward
coins = floor(base * (1 + min(winStreak * 0.02, 0.30)))
```

Slightly softer early and slightly richer late than the old flat `opponentLevel * 5`;
the real early-game relief comes from level-scaled sinks (see "Equipment economy").

At level 70, overflow XP is converted to coins at `1 XP = 1 coin`, then XP is reset to 0.

## Equipment economy

Gear rolls and sub-stat rerolls are priced by the **buyer's level** so they stay
worth roughly the same number of wins at every stage:

```txt
gearRollPrice(level)  = 250 + level * 22       # ~272 at L1, ~1790 at L70
rerollSubStatCost(level) = floor(gearRollPrice(level) * 0.5)
```

Both are exposed on the profile payload (`gearRollPrice`, `rerollSubStatCost`) and
`buyShopItem` / `rerollEquipmentSubStat` charge the live value.

Scrapping a piece (`getFodderRefund`) refunds `40%` of the current roll price plus
`40%` of the coins sunk into enhancing it (`getEnhancementCoinsSunk`), floored at
`MIN_FODDER_REFUND` (150) — so a heavily-enhanced piece is not worth the same as a
fresh roll, but scrapping is always a net loss versus what was spent.

### Slot identity, enhancement, sets (improve.md §8)

- **Distinct main stat per slot** — weapon `dmgPct` 6–14, armor `defendPct` 8–18,
  charm `critRate` 5–25 **or** `critDmg` 10–60. That slot's own main stat can never
  appear as one of its 4 sub-stats.
- **Enhancement main scaling** — `enhancedMainStatValue = round(rolled * (1 + level * 0.10))`;
  at +15 that is `2.5×` the rolled value (was a flat `+1`/level).
- **Enhancement sub-stat ticks** — at +3/+6/+9/+12/+15 one random sub-stat line gets a
  permanent boost of `round(midpoint(range) * 0.30)`, stored in `subStatBonuses[]`
  apart from the rolled value; a reroll of that line resets only its own boost.
  Enhancement coin cost per level is unchanged: `round(350 * 1.45^level)`.
- **`rerollKeepHigherCharges`** — if the owner has a charge, `rerollEquipmentSubStat`
  keeps `max(old, rolled)` and consumes the charge (`keptHigher` / `keepHigherChargesRemaining`
  on the response).
- **Set bonuses** — each rolled piece gets a random `setId` from `EQUIPMENT_SETS`
  (Berserker / Sentinel / Trickster). Equipping 2 matching pieces grants that set's
  `bonus2`, 3 grants `bonus3` (which replaces, not stacks with, `bonus2`); bonus values
  are percentage points added straight to the pct stats. `computeEquipmentStats` returns
  a `sets` summary and the profile payload carries `equipmentSets`.
- NPC `equipmentPctStats` bumped (dmgPct 16→22, defendPct 12→18, hpPct 8→12) to keep
  parity with the stronger geared player.

## Titles (endgame coin sink)

`TITLE_CATALOG` (`arena-constants.js`) is a ladder of **purely cosmetic** titles
(25k → 15M coins). `lib/arena/titles.js` owns the flow:

- `arena_titles(userId, titleId, purchasedAt)` records ownership; a title cannot be
  bought twice.
- `arena_profiles.activeTitleId` is the displayed one; the first purchase
  auto-activates, and `setActiveArenaTitle` (with an empty id to clear) switches it.
- `resolveActiveTitle(activeTitleId)` → `{ id, name } | null` is embedded as `title`
  in the profile payload, every leaderboard row, and the PvP fight-opponent snapshot
  (never for NPCs).
- Endpoints: `GET /arena/shop/titles`, `POST /arena/shop/titles/buy`,
  `POST /arena/shop/titles/activate`.

Titles have no stats and never touch combat — they exist only to give capped
players somewhere for coins to go.

**NPC fights pay less.** After all other adjustments, an NPC fight's XP and coin
deltas are multiplied by `NPC_REWARD_SCALE` (0.75). NPC fights are also unrated,
so PvP is the efficient path despite its ELO variance.

## Defender rewards

When a real player is picked as someone's opponent (`settleDefenderFight`, PvP only):

- they earn a flat coin stipend: `floor((10 + defenderLevel * 2) * (defenderWon ? 1.5 : 1))`;
- `defensiveWins` / `defensiveLosses` is incremented (surfaced on the profile and leaderboard);
- the consumable charges/durations that fired while defending are spent (see below);
- a `defense_reward` inbox notification is created (display only — the coins are already paid).

NPC opponents have no stored profile and receive none of this.

## Market & trade friction

The player-to-player economy has four friction points (improve.md §7), all in
`lib/arena/market.js` / `lib/arena/trade.js`:

- **Level gate** — `ARENA_TRADE_MIN_LEVEL` (10). Creating/buying a market listing
  and creating/sending/accepting a direct trade all require it
  (`ARENA_TRADE_LEVEL_LOCKED`).
- **Sale commission** — `MARKET_SALE_COMMISSION_RATE` (7%). On a completed market
  sale the buyer pays the full price and the seller receives
  `price - round(price * rate)`. The same cut applies to coins moved in a direct
  trade. The commission is **burned** — it leaves the coin supply, the only P2P sink.
- **Listing fee** — `max(round(price * MARKET_LISTING_FEE_RATE), MARKET_LISTING_FEE_MIN)`
  (2%, min 100), charged when the listing is created and **never refunded**
  (sale, cancel, or expiry). Returned on the response as `listingFee`.
- **Price ceiling** — a listing's asking price cannot exceed
  `min(round(ref * MARKET_PRICE_CEILING_MULTIPLIER), MARKET_MAX_PRICE)`, where
  `ref` is `getMarketPrice` (recent comparable-sales average, or the shop baseline
  when there is no history). Exposed on the price guide as `maxListingPrice`;
  violations throw `ARENA_MARKET_PRICE_TOO_HIGH`.

## ELO

ELO uses the standard expected-score formula:

```txt
expectedWinner = 1 / (1 + 10 ^ ((loserRating - winnerRating) / 400))
delta = round(kFactor * (1 - expectedWinner))
```

Provisional fighters use `K = 48`. Established fighters use `K = 24`. Ratings are floored by the configured minimum.

## 60-Turn Timeout

When both fighters survive the 60-turn cap, the winner is chosen by remaining HP percentage:

```txt
playerPercent = playerHp / maxPlayerHp
opponentPercent = opponentHp / maxOpponentHp
```

The higher percentage wins. If percentages tie, normal round tiebreaking uses power, then speed, then a coin flip.

## NPC Scaling

NPCs use templates with base rarity, IV range, stat scale, and synthetic progression bonuses. Their snapshots include:

- base stats scaled by template and level
- synthetic equipment flat stats
- synthetic equipment percentage stats
- synthetic skill stats
- active passive list when the template has one

This keeps high-level NPCs closer to real players who have gear and skill-tree progression.

## Skill Tree

The tree has 45 nodes (3 branches × 3 chains × 5 tiers, linear prerequisites per
chain). Earned points are `floor(level * SKILL_POINTS_PER_LEVEL)` with
`SKILL_POINTS_PER_LEVEL = 0.5`, plus a **+1 milestone point at level 50 / 60 / 70**
(`SKILL_POINT_MILESTONE_LEVELS`) so the back quarter of the level range delivers
something other than flat stats (improve.md §10). A level-70 player has **38
points for 45 nodes** — the last chain is a real trade-off, not a guaranteed
pickup.

Respec (`resetArenaSkills`) clears every allocation for
`level * SKILL_RESET_COST_PER_LEVEL` coins (`300`/level, 21,000 at cap) and is
then locked for `SKILL_RESET_COOLDOWN_MS` (3 days). A blocked reset returns
`ARENA_SKILL_RESET_COOLDOWN` with `cooldownEndsAt` / `retryAfterMs`. The skill
payload exposes `resetOnCooldown` and `resetCooldownEndsAt`.

## Card Affinity

Fighting with a card builds per-card affinity. Levels are reached at
`AFFINITY_THRESHOLDS` = **6 / 18 / 45 / 100 / 190** career fights on that card, so
the first levels are an early-game nudge and level 5 is still a real commitment
(improve.md §11).

Each level adds `AFFINITY_STAT_STEP` (**3**) to one stat, cycling
`power → guard → speed → effectHit → power`, so a maxed card is **+6 power, +3
guard, +3 speed, +3 effectHit**. This is applied as a **direct stat bonus** on the
combat snapshot (its own `affinity` line in the stat breakdown) — it does **not**
ride the card-IV path and is not divided by 3 the way sigil / card-item bonuses
are, which is what made the old bonus (~1% at 250 fights) invisible.

## Consumable Stacking Rules

Consumables have two stacking layers:

- Same effect type: activating the same consumable type extends charges or fight duration while the stored effect value stays fixed.
- Different effect types: effects can stack together, but only up to the active consumable slot limit and the combat caps above.

Current active consumable rules:

- A player can have up to 4 active consumable effect types.
- When activating a fifth effect, the player must choose which active effect to replace.
- Inventory quantity is capped per item type.
- Two different decrement paths:
  - **Economy boosts** (exp / coin / bonus-draw) tick down once per fight in
    `consumeFightBoostDurations`, win or loss — despite the `…WinsRemaining` field name.
  - **Combat-effect durations and charges** are spent by `applyFightEffectUsage`, and only
    for effects that actually applied that fight: fight-start stat buffs (damage, speed,
    guard, stat-steroid, crit, evade, shield…) tick every fight they're active; one-shot
    charges (first-attack double, KO saves, IV boost, gate key…) are consumed only when they
    trigger — so e.g. `first_attack_double` is not wasted on a fight where it never landed.
- Both sides pay: a PvP defender spends the same charges/durations for effects that fired
  while defending as the attacker does. NPC opponents have no stored effects.

Damage-related consumables are still constrained by `MAX_COMBINED_DAMAGE_MULTIPLIER`. Evasion is constrained by the 44% live evasion cap. Revive effects are one-use KO saves according to the priority rules above.

## Runtime Balance Monitoring

The admin metrics endpoint reports these threshold alerts:

- Damage turns above 1000.
- Active evasion effect values above 50%.
- Win streaks above 100.

These alerts are monitoring signals for balance review. They do not automatically nerf or block a fight.
