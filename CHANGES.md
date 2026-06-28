# Changes

## 2026-06-28 — Tutorial coin bonus spread across 5 milestones

**`applyLevelUps` coin logic in all `mirabellier-backend/lib/arena/*.js` (18 files)**

The tutorial coin bonus was a single 10,000-coin injection at level 5 — a huge one-time rush that skewed early progression. Now spread across 5 milestones: 2,000 coins each at levels 5, 8, 12, 16, and 20 (same 10K total).

| | Before | After |
|---|---|---|
| Trigger | Level 5: +10,000 | Levels 5/8/12/16/20: +2,000 each |
| Total | 10,000 | 10,000 |
| Feel | One big dump | Gradual rewards |

Existing users who already received the old 10K bonus are grandfathered — their `tutorialComplete` is set to 20 so they don't double-dip. New players get the spread.

**Files changed (18):** `combat.js`, `updates.js`, `archive.js`, `shop.js`, `equipment.js`, `effects.js`, `collection.js`, `cards.js`, `card-shop.js`, `market.js`, `leaderboard.js`, `hall-of-fame.js`, `notifications.js`, `mint.js`, `playback.js`, `profile.js`, `skill-tree.js`, `trade.js`.

**Migration script:** `scripts/migrate-tutorial-coins.cjs` — grandfathers existing users.

---

## 2026-06-28 — Equipment dmgPct sub-stat range narrowed

**`SUB_STAT_POOL.ranges.dmgPct` in `mirabellier-backend/lib/arena-constants.js`**

The `dmgPct` sub-stat range was 5–45% per roll with 4 sub-stats per piece — meaning a single equipment piece could roll up to +180% bonus damage. Now capped at +20% per roll (max +80% per piece), making damage bonuses meaningful but not game-breaking.

| | Before | After |
|---|---|---|
| `dmgPct` range | 5–45% | 5–20% |
| Max per piece (4 sub-stats) | +180% | +80% |

---

## 2026-06-28 — Win streak XP now logarithmic (uncapped)

**`calculateWinXp` in all `mirabellier-backend/lib/arena/*.js` (18 files)**

Win streak bonus was hard-capped at `min(streak, 10)` — streaks past 10 gave zero extra XP. Now uses logarithmic scaling so every win beyond 10 still rewards more, just with diminishing returns.

| | Before | After |
|---|---|---|
| Formula | `min(streak, 10)` | `floor(log2(streak + 1)) * 3` |
| Streak 5 | +5 XP | +6 XP |
| Streak 10 | +10 XP | +10 XP |
| Streak 20 | +10 XP (capped) | +12 XP |
| Streak 31 | +10 XP (capped) | +15 XP |
| Streak 63 | +10 XP (capped) | +18 XP |

**Files changed (18):** `combat.js`, `updates.js`, `archive.js`, `shop.js`, `equipment.js`, `effects.js`, `collection.js`, `cards.js`, `card-shop.js`, `market.js`, `leaderboard.js`, `hall-of-fame.js`, `notifications.js`, `mint.js`, `playback.js`, `profile.js`, `skill-tree.js`, `trade.js`.

---

## 2026-06-28 — Rarity power bonus scales with level

**`calculateRoundPower` + `calculateAttackOutcome` in all `mirabellier-backend/lib/arena/*.js` (18 files)**

Rarity power bonuses (C: 0, R: +3, SR: +7, SSR: +12, UR: +18) were flat — huge at level 1 but negligible at level 70 where base power reaches ~150. Now the bonus scales with the card owner's level.

| Level | UR was | UR now | Formula |
|---|---|---|---|
| 1 | +18 | +18.4 | `powerBonus * (1 + level * 0.02)` |
| 30 | +18 | +28.8 | |
| 50 | +18 | +36.0 | |
| 70 | +18 | +43.2 | |

**Functions changed:**
- `calculateRoundPower(input)` — added `level = 1` param
- `calculateAttackOutcome(input)` — added `attackerLevel = 1` and `defenderLevel = 1` params
- `simulateFight` call site — passes `player.level` / `opponent.level` through

**Files changed (18):** `combat.js`, `updates.js`, `archive.js`, `shop.js`, `equipment.js`, `effects.js`, `collection.js`, `cards.js`, `card-shop.js`, `market.js`, `leaderboard.js`, `hall-of-fame.js`, `notifications.js`, `mint.js`, `playback.js`, `profile.js`, `skill-tree.js`, `trade.js`.

---

## 2026-06-28 — Consumable durations normalized

**Default profile initializations in all `mirabellier-backend/lib/arena/*.js` (19 files) + crafting definitions in `mirabellier-backend/lib/arena-constants.js`**

Boost consumable durations were wildly inconsistent — Damage/Speed Boost gave 200 fights per craft while Guard/Crit Boost gave 1,500 fights. Same crafting effort, 7.5× difference in value.

Now all four boost consumables are normalized to a uniform **500 fights**, both as default profile values and as crafted item effects.

| Field | Before (defaults) | After | Before (crafted) | After |
|---|---|---|---|---|
| `damageBoostFightsRemaining` | 200 | 500 | 100 | 500 |
| `speedBoostFightsRemaining` | 200 | 500 | 100 | 500 |
| `critChanceBoostFightsRemaining` | 1500 | 500 | 750 | 500 |
| `guardBoostFightsRemaining` | 1500 | 500 | 750 | 500 |

**Files changed (19):** `combat.js`, `utils.js`, `updates.js`, `archive.js`, `shop.js`, `equipment.js`, `effects.js`, `collection.js`, `cards.js`, `card-shop.js`, `market.js`, `leaderboard.js`, `hall-of-fame.js`, `notifications.js`, `mint.js`, `playback.js`, `profile.js`, `skill-tree.js`, `trade.js`, plus `arena-constants.js`.

No frontend changes needed — the frontend reads durations dynamically from the backend API responses.

---

## 2026-06-28 — Element effectiveness softened

**`ELEMENT_EFFECTIVENESS` + element multiplier formula in all arena modules**

Element counters were too punishing at 1.5× / 0.5× — a disadvantaged player dealt half damage AND took 1.5×, effectively a 3× power swing.

| | Before | After |
|---|---|---|
| Super-effective | 1.5× | 1.3× |
| Not-very-effective | 0.5× | 0.7× |
| Element multiplier formula | `1.5 + atkEffectHit * 0.02` | `1.3 + atkEffectHit * 0.02 - defEffectHit * 0.01` |

Defender's `effectHit` now reduces incoming elemental damage (symmetric with attacker's). Element advantage is still meaningful but no longer fight-deciding on its own.

---

## 2026-06-28 — Crits allowed on super-effective hits

**`calculateAttackOutcome` in all `mirabellier-backend/lib/arena/*.js` (19 files)**

Crits were completely blocked when your element had advantage (`elementMult > 1.0`), punishing players who invested in crit gear. Now super-effective hits can still crit, but at halved chance.

| Before | After |
|---|---|
| Crit blocked entirely on element advantage | Crit allowed at 50% of normal chance |
| Crit gear wasted vs weak elements | Crit gear always has value |

---

## 2026-06-28 — Coin economy improved + materials removed

**`calculateWinCoins` in all `mirabellier-backend/lib/arena/*.js` (19 files)**

Coin rewards per win increased: `opponentLevel * 3` → `opponentLevel * 5`. At level 70, base coins per win go from ~228 to ~368 (with UR rarity bonus).

**`buildRecipes` in `mirabellier-backend/lib/arena-constants.js`**

Crafting recipes now use flat coin costs per tier (200 / 800 / 3,200 / 10,000 / 36,000 / 120,000) instead of complex material-based pricing. Simplifies the economy and removes the deprecated material dependency.

**Materials system fully removed:**

- Removed `materials` arrays and `materialPrices` from all 6 tiers in TIER_CONFIG
- Removed `normalizeMaterialItem()`, `CONSUMABLE_CRAFT_COIN_FEES`
- Removed `rollFightMaterialRewards` from test exports
- Removed `ArenaMaterialReward` type and `materialDrops` from frontend API types
- Removed 18 material sprite mappings from `arena-shop-ui.tsx`
- Removed material-related tests

---

## 2026-06-28 — XP curve softened

**`xpToNext` in all `mirabellier-backend/lib/arena/*.js` (19 files)**

Quadratic XP scaling was too punishing at high levels. Level 69→70 took ~32 days of all-wins.

| | Before | After |
|---|---|---|
| Formula | `80 + 40 * level²` | `80 + 25 * level²` |
| Level 1→2 | 120 XP | 105 XP |
| Level 10→11 | 4,080 XP | 2,580 XP |
| Level 30→31 | 36,080 XP | 22,580 XP |
| Level 69→70 | 190,520 XP | 119,080 XP |

~37% less XP needed at all levels. High-level progression is still meaningful but no longer demotivating.

---

## 2026-06-28 — Speed stat rebalance

**`computeEvasionChance` + turn order in `mirabellier-backend/lib/arena/combat.js`**

Speed was nearly worthless — a 10-point advantage gave only 2% extra evasion, and turn order was `speed + random(0,8)`, drowning speed in RNG.

**Fix A — Evasion scaling doubled:**

| Multiplier | Before | After |
|---|---|---|
| `defSpeed` | `* 0.002` | `* 0.004` |
| `atkSpeed` | `* 0.001` | `* 0.002` |

A 50-point speed gap now gives ~20% evasion instead of ~10%.

**Fix B — Turn order RNG halved:**

| Initiative roll | Before | After |
|---|---|---|
| Random range | `randomInt(0, 8)` | `randomInt(0, 4)` |

Speed now matters twice as much for determining who goes first.

---

## 2026-06-28 — Stat Rebalance (HP formula)

**`computeMaxHp` in `mirabellier-backend/lib/arena/combat.js`**

Guard was double-dipping — giving the most HP *and* the best damage reduction — making it the only optimal stat. This change opens up three viable build paths (power, guard, speed) instead of forcing everyone into Guard.

| Multiplier | Before | After |
|---|---|---|
| `guard → HP` | `guard * 2.2` | `guard * 1.5` |
| `(power + speed) → HP` | `sum * 0.35` | `sum * 0.7` |

- Guard builds: slightly less HP, still strong mitigation.
- Power builds: noticeably more HP.
- Speed builds: noticeably more HP.
- Hybrid builds: now competitive.
