# TODO

## Arena fixes

- ~~Add card sacrifice/fodder for coins.~~ ✅ DONE — `sacrificeCollectionCards`, `calculateCardSacrificePayout`, route at `/arena/collection/sacrifice`.
- ~~Add friendship/affinity for frequently used characters.~~ ✅ DONE — `AFFINITY_THRESHOLDS`, `recordCardAffinityFight`, `getCardAffinity`, shown in `toPublicProfile`.
- ~~Add drag support to switch between left and right cards to Arena minting.~~ ✅ DONE — `draggable` + `onDragStart`/`onDragOver`/`onDragEnd` in `ArenaMint.tsx`.
- Investigate ArenaFight hook dependency warnings in `src/pages/ArenaFight.tsx`; stale `activeFight` or HP deps could cause resume/animation state to desync.
- Make active fight resume/retry behavior testable so interrupted fights cannot get stuck between active and finished states.

---

## 🔴 Arena Game Audit (Revised 2026-06-28)

*Full analysis of Arena combat, stats, gear, equipment, economy, consumables, and AFK design. Excludes TCG. Re-audited with max-level, full-equipment, and all-consumables scenarios.*

---

### 📊 Max-Level & Max-Gear Scenario Analysis (NEW)

**Max level = 70.** At level 70:
- Base stats: HP 672, Power 150, Guard 150, Speed 79, EffectHit 72
- XP formula: `xpToNext(70) = 80 + 25 × 70² = 122,580`
- At max level, `applyLevelUps` sets XP to 0 — all excess XP is wasted.
- **Problem:** No post-max progression. Players at level 70 have no XP/level incentive. Coins become the only remaining grind.

**Maxed equipment (ideal rolls, all 3 slots):**
- Weapon: mainStat power 1–10 + 4 substats (each up to 10) → theoretical max ~+50 power
- Armour: mainStat guard 1–10 + 4 substats → theoretical max ~+50 guard
- Charm: mainStat critRate 5–25 or critDmg 10–60 + 4 substats → up to +125% critRate or +300% critDmg
- Combined flat stats (realistic high-roll): ~+50 power, ~+50 guard, ~+40 speed, ~+40 effectHit
- Equipment has NO upgrade/enhancement path — pieces are one-and-done.

**All consumables active simultaneously (worst-case scenario):**
- `statSteroid` (200%): all stats ×3 → power ~783
- `damageBoost` (200%): attack damage ×3 → per-hit ~2,349
- `speedBoost` (200%), `guardBoost` (200%), `critChanceBoost` (200%)
- `vampiricHeal` (100%): heal all damage dealt
- `deathSave` + `selfRevive`: near-immortal
- `shield_fight_start` (up to 9999 HP shield)
- `evadeBoost` (up to 95% evasion)
- **Result:** A player with all consumables can become effectively invincible and one-shot any opponent.
- **Root cause:** All consumables can be active simultaneously with no combined cap.

---

### ⚠️ Critical Bugs

1. **`dailyOpponentCount` reset is called on wrong user**
   - `resetDailyOpponentCount(db, current.userId)` resets the attacker's count every fight — but this counter tracks how often you've been *used as an opponent* (defender). The reset should apply to the opponent or only trigger on day rollover.
   - `incrementDailyOpponentCount` uses `datetime('now', '-5 hours')` as a SQL literal — timezone/boundary edge cases possible.
   - *Files:* `arena-core.js` ~L6311, ~L8060.

2. **NPC opponents missing equipment & skill tree stats**
   - `buildNpcOpponent()` provides only base profile stats × `statScale`. No equipment pieces, no skill tree bonuses.
   - Real players get `computeEquipmentStats` + `getSkillState` via `loadCombatSnapshot`.
   - At higher levels, NPCs are significantly weaker than equivalently-leveled real players (gap widens with better gear/skills).
   - *Files:* `arena-core.js` ~L5176 (`buildNpcOpponent`), ~L4600–4700 (`loadCombatSnapshot`).

3. **Fight stuck at 60-turn cap: tiebreaker uses HP as "power"**
   - When `maxTurns = 60` is reached and both survive, `resolveRoundWinner` is called with `playerPower: playerHp` (HP value, not power stat). This is semantically wrong — the tiebreaker should compare remaining HP% or a different formula.
   - *Files:* `arena-core.js` ~L6170–6200.

4. **`selfRevive` triggers on ANY hp threshold, not just KO**
   - `selfRevive` check runs `if (opponentHp > 0 && ... hpPct <= threshold)` — this fires mid-fight when HP drops below threshold, restoring full HP. Intended design is unclear: should it be a one-time KO revive or a mid-fight full heal?
   - Combined with `deathSave` (survive KO at 1 HP), the interaction is undefined: both can fire on the same hit.
   - *Files:* `arena-core.js` ~L5921.

5. **🆕 XP progress formula mismatch (leaderboard vs actual)**
   - JS: `xpToNext(level) = 80 + 25 * level * level`
   - Leaderboard SQL: `(80 + 40 * p.level * p.level)` — uses 40 instead of 25, drastically inflating denominator.
   - Result: leaderboard shows all players' XP progress as much lower than reality.

6. **🆕 No inventory quantity cap for consumables**
   - `upsertInventoryItem` has no maximum quantity check. A player can craft unlimited consumables into inventory.
   - `applyConsumableEffect` caps active effect charges at `charges * 2` (soft cap), but you can stockpile items to re-activate later.
   - Combined with no limit on simultaneous active effects, a prepared player becomes virtually unkillable.

7. **🆕 All consumables can be active simultaneously with no combined cap**
   - `statSteroid` (×3 stats) × `damageBoost` (×3 damage) stack multiplicatively.
   - With `guardBoost`, `speedBoost`, `critChanceBoost`, `vampiricHeal`, `deathSave`, `selfRevive`, `shield`, `evadeBoost` all active at once, a player has no counterplay.
   - No global damage multiplier cap, no limit on number of simultaneous active effects.

---

### 🔧 Technical Issues

8. **`rollFightMaterialRewards()` is a stub returning `[]`**
   - Materials/crafting system is defined in constants (SHOP_ITEMS, SHOP_RECIPES) but no materials ever drop from fights.
   - Consumables are crafted with coin-only recipes — material inputs are `[]`.
   - *Files:* `arena-core.js` L4688, `arena-constants.js` ~L670–696.

9. **Equipment substat `crit` and `critDmg` naming inconsistency**
   - Substats use `"crit"` → maps to `pctStats.critChancePct`. Main stat on charms uses `"critRate"` → also maps to `pctStats.critChancePct`. Different names for the same stat.
   - *Files:* `arena-constants.js` ~L90–113 (`SUB_STAT_POOL`), `arena-core.js` ~L1310–1340.

10. **ELO matchmaking pool small for low-population periods**
    - `ELO_MATCHMAKING_POOL_SIZE = 5`, `ELO_MATCHMAKING_CANDIDATE_LIMIT = 20`. With few active players, matchmaking falls back to NPCs — but NPCs have no ELO gain.
    - *Files:* `arena-core.js` ~L88–91.

11. **`computeEquipmentStats` doesn't apply `hpPct` to the returned flat stats**
    - `hpPct` is returned separately in `pct` object. `computeMaxHp` applies it correctly, but `toPublicProfile` shows `equipmentStats.hp` without the `hpPct` multiplier, causing a display discrepancy.
    - *Files:* `arena-core.js` ~L1300–1360, ~L4859–4866.

12. **`consumeFightBoostDurations` only decrements on wins**
    - `expBoostWinsRemaining`, `coinBoostWinsRemaining`, `drawBonusChanceWinsRemaining` are only consumed when the player wins. On a loss, these buffs persist without decrementing — making them last indefinitely for losing streaks.
    - *Files:* `arena-core.js` L4881, called only in win branch at ~L6515.

---

### ⚖️ Game Balancing Issues

#### Stats & Leveling

13. **HP formula over-values `guard` stat**
    - `computeMaxHp`: `hpBase + guard * 1.5 + (power + speed) * 0.7`. Guard contributes 2.14× more to HP than power/speed.
    - A guard-heavy build gets both high defense AND high HP. Power builds are fragile.
    - *Suggestion:* Reduce guard multiplier to 1.0 and increase base HP contribution.

14. **XP formula creates extreme snowball for streakers**
    - `Math.floor(Math.log2(winStreak + 1)) * 3` — at streak 127 this is +21 XP/fight. Combined with XP boosts (100%+ from consumables) and rarity coin passives, high-streak players level 3–4× faster.
    - For an AFK game, this encourages never logging out (streak resets on loss).
    - *Suggestion:* Cap streak XP bonus at ~5 consecutive wins. Add a small "rested" bonus for returning after inactivity.

15. **Coin economy bottlenecks at high levels**
    - Win coins: `18 + oppLevel * 5 + rarityCoinReward` → at level 70 vs UR: 18 + 350 + 18 = 386 coins.
    - Equipment rolls cost 1000 each. Card shop: UR = 10000 coins. Skill reset: `level * 100` (up to 7000).
    - A player earning ~350 coins/win needs ~3 fights for one gear roll, ~29 fights for one UR card.
    - No coin scaling with win streak — unlike XP.
    - *Suggestion:* Add streak coin multiplier (capped), or reduce equipment roll costs at higher levels.

16. **Element effectiveness scaling is unbounded with `effectHit`**
    - Formula: `1.3 + attackerEffectHit * 0.02 - defenderEffectHit * 0.01`.
    - At 35 effectHit: `1.3 + 0.7 = 2.0×` multiplier. Combined with base 1.3 element multiplier → ~2.6× effective.
    - `effectHit` has no other combat use — it only affects element multiplier.
    - *Suggestion:* Cap element effectiveness at 1.8× total. Give `effectHit` a secondary effect (e.g., small chance to pierce shield or reduce evasion).

17. **Evasion formula can reach problematic levels**
    - Base: 4% + defenderSpeed * 0.004 - attackerSpeed * 0.002 + extraEvasionPct/100.
    - With evade consumable (+95% possible!), evasion can exceed the 60% cap easily.
    - *Suggestion:* Reduce evasion cap from 60% to 35%. Evasion is frustrating in AFK games.

18. **🆕 Max level (70) has no post-progression content**
    - XP earned at max level is zeroed. No paragon levels, no prestige, no alternate advancement.
    - Coins become the only remaining grind — but with nothing to spend them on after maxing gear.
    - *Suggestion:* Add paragon/prestige reset at level 70 (reset level to 1, keep equipment/collection, earn prestige tokens). Or add "overflow XP → coins" conversion.

19. **🆕 Combined consumable multiplier has no hard cap**
    - `statSteroid` (×3 stats) × `damageBoost` (×3 damage) × element (×2.6) × crit (×3.0) = up to ~70× damage.
    - No global damage cap in combat formulas.
    - *Suggestion:* Add `MAX_COMBINED_DAMAGE_MULTIPLIER = 4.0` (or 5.0). Clamp the product of all multipliers.

#### Equipment & Gear

20. **Equipment substat variance is too extreme (5:1 ratio)**
    - `dmgPct: [5, 20]` — best roll is 4× worst. `critDmg: [10, 60]` — 6× variance.
    - A player rolling 4 bad substats wastes 1000 coins with no pity/upgrade path.
    - *Suggestion:* Tighten ranges (e.g., `dmgPct: [10, 20]`), add a "reroll one substat" feature, or allow foddering pieces to boost another piece's substats.

21. **No equipment upgrade/progression system**
    - Equipment pieces are one-and-done: roll → equip or fodder for 500 coins.
    - No way to improve a piece you like. This hurts long-term engagement.
    - *Suggestion:* Add equipment enhancement: spend coins + fodder pieces to increment main stat or reroll one substat. Add enhancement levels (e.g., +1 to +15) with increasing costs.

22. **Only 3 equipment slots with no diversity**
    - Weapon (power roll), Armour (guard roll), Charm (critRate or critDmg roll).
    - No accessories, no set bonuses, no elemental gear.
    - *Suggestion:* Add 1–2 more slots (e.g., ring, boots). Add tiered gear sets with 2-piece and 3-piece bonuses.

#### Consumables & Effects

23. **Consumable duration limits are inconsistent**
    - `coinBoostWinsRemaining: 40` vs `expBoostWinsRemaining: 500` — coin boost lasts 12.5× fewer fights.
    - `gateKeyCharges: 4` but fight cooldown is only 5 seconds — near-useless for an AFK game.
    - *Suggestion:* Normalize durations. For AFK play, consumables should last hours, not fights. Consider time-based durations.

24. **Consumable stacking is undefined**
    - `damageBoost` and `statSteroid` both affect power — `statSteroid` multiplies base stats, then `damageBoost` adds % to attack damage. They stack multiplicatively → extreme burst potential.
    - *Suggestion:* Document stacking rules. Cap total damage multiplier (e.g., +200% max).

25. **No anti-snowball mechanics for losers**
    - Losing a fight: streak resets to 0 (unless streak shield consumable), no XP/coins, no consolation.
    - For an AFK game where users leave devices running, a bad RNG loss streak is punishing.
    - *Suggestion:* Grant small loss XP (25–50% of win XP). Keep streak as the bonus, not the baseline.

26. **🆕 Consumable inventory has no per-item quantity cap**
    - `upsertInventoryItem` accepts any positive quantity. `craftShopRecipe` allows crafting up to 20 at once.
    - No cap on total inventory items, no cap per item type.
    - *Suggestion:* Cap inventory at 99 per item type. Or cap at 999 total items.

27. **🆕 XP/coin boost durations only consumed on wins**
    - `consumeFightBoostDurations` is only called in the win branch. On losses, these buffs last forever.
    - This is arguably a bug: boosts should probably decrement per fight regardless of outcome.

#### AFK-Specific Design

28. **No fight speed setting for AFK mode**
    - The game has fight animations but no "speed up" or "skip animation" toggle.
    - AFK players want instant results, not 60-turn animations.
    - *Suggestion:* Add "Instant Resolve" toggle in Arena settings.

29. **No session summary or idle report**
    - When returning after AFK, players see nothing — they have to check profile for changes.
    - *Suggestion:* Show a "While you were away" summary: fights won/lost, XP gained, levels gained, coins earned, cards drawn, items used.

---

### 👁️ Visual / UI Bugs

30. **Equipment piece stats display may not include `hpPct` contribution**
    - `toPublicProfile` returns equipment stats without `hpPct` factored into `total.hp`. `computeMaxHp` uses it correctly for combat, but the displayed total HP may differ from combat effective HP.

31. **Passive effects from skill tree not shown in pre-fight UI**
    - `activePassives` from skill tree are computed server-side but the frontend may not display which passives are active before a fight.

32. **Card shop "Random Card" offer only available Sun/Tue/Thu/Sat**
    - The day check uses UTC (`getUTCDay()`). Players in timezones far from UTC may see the offer available/unavailable at unexpected times relative to their local day.

33. **NPC opponents always show as "Unknown" if user row missing**
    - `selectOpponentForFight` queries `users` table for display name. If the real opponent's user row is missing, they show as "Unknown" — should fall back to "Anonymous Challenger" or similar.

34. **🆕 Leaderboard XP progress uses wrong formula**
    - SQL uses `(80 + 40 * p.level * p.level)` but JS uses `80 + 25 * level * level`. All leaderboard XP progress bars are wrong.

---

### 📋 Day-by-Day Improvement Plan

> **Last re-audited:** 2026-06-28 against `arena-core.js` (~8400 lines). Three originally-planned features completed (card sacrifice, affinity, drag-to-mint). New findings from max-level and consumable cap analysis integrated.

---

#### 🔴 Day 1: Critical Bug Fixes

- [ ] **Fix `dailyOpponentCount` reset logic** — Reset on day rollover, not after every fight.
- [ ] **Fix 60-turn tiebreaker** — Use HP **percentage** (`playerHp/maxPlayerHp` vs `opponentHp/maxOpponentHp`).
- [ ] **Fix `selfRevive` trigger scope** — Clarify design: KO revive (HP ≤ 0) or low-HP heal (rename to "Last Stand").
- [ ] **Fix leaderboard XP progress formula** — Change SQL from `40` to `25` to match `xpToNext()`.
- [ ] **Fix `consumeFightBoostDurations` only on wins** — Decrement boost durations every fight, not just on wins.

---

#### 🟠 Day 2: Consumable Caps & Combat Fairness

- [ ] **Give NPC opponents equipment & skill tree bonuses** — Add `equipmentBonus` multiplier to NPC templates, scaled by level.
- [ ] **Add loss consolation** — Grant 25–50% of win XP on loss.
- [ ] **Add combined consumable damage cap** — Clamp total damage multiplier (statSteroid × damageBoost × element × crit) at 4.0–5.0×.
- [ ] **Add consumable inventory per-item cap** — Max 99 per item type or 999 total inventory items.
- [ ] **Limit simultaneous active consumable effects** — Max 3–4 active consumable effects at once; using a new one replaces the oldest.

---

#### 🟡 Day 3: Stat & Economy Balancing

- [ ] **Rebalance HP formula** — Reduce guard multiplier from 1.5 to 1.0: `guard * 1.0 + (power + speed) * 0.8`.
- [ ] **Cap win-streak XP bonus** — `Math.min(Math.log2(winStreak + 1), Math.log2(6)) * 3` (cap at streak 5).
- [ ] **Add streak coin multiplier** — `+2% coins per streak, capped at +30%`.
- [ ] **Cap element effectiveness** — Clamp `1.3 + effectHit * 0.02 - defenderEffectHit * 0.01` at 1.8×. Give `effectHit` a secondary effect (e.g., 1% shield pierce per 10 pts).
- [x] ~~**Reduce evasion cap** — From 60% to 44%.~~ ✅ DONE — Combat evasion clamp is now 44%.
- [ ] **Add max-level overflow** — Convert excess XP to coins at level 70 (e.g., 1 XP = 5 coins).

---

#### 🟢 Day 4: Equipment System Improvements

- [ ] **Tighten substat roll ranges** — `dmgPct: [10, 20]`, `critDmg: [15, 50]`, `defendPct: [10, 25]`, `hpPct: [3, 10]`, `crit: [8, 20]`.
- [ ] **Add equipment enhancement system** — Spend coins + fodder pieces for +1 main stat per level, +1 to +15 with exponential costs.
- [ ] **Add "reroll one substat" feature** — 500 coins + 1 fodder piece, pick one substat to reroll.
- [ ] **Fix `hpPct` display in profile** — Factor `hpPct` into displayed HP in `toPublicProfile`.
- [ ] **Rename substat `crit` → `critRate`** in `SUB_STAT_POOL` for consistency.

---

#### 🔵 Day 5: Consumable & Effect Tuning

- [ ] **Normalize consumable durations** — `coinBoostWinsRemaining: 250` (was 40), `gateKeyCharges: 50+` or remove.
- [ ] **Implement material drops** — `rollFightMaterialRewards()` returns 0–2 random materials per win based on opponent level.
- [ ] **Add recipe inputs for consumables** — Add material requirements to make the material drop system meaningful.
- [ ] **Document & enforce consumable stacking rules** — Additive for same-type, multiplicative across types, with global cap.

---

#### 🟣 Day 6: AFK Quality of Life

- [ ] **Add "Instant Resolve" toggle** — Skip fight animation, show result immediately. Store preference in profile.
- [ ] **Add auto-fight stop conditions** — Stop on loss, on level-up, after N fights.
- [ ] **Add session summary** — "While you were away: W wins, L losses, +XP, +coins, Lv↑."
- [ ] **Add fight speed setting** — Normal, Fast (2×), Instant.

---

#### ⚪ Day 7: UI Polish & Visual Fixes

- [ ] **Show active passives in pre-fight summary.**
- [ ] **Fix NPC fallback display name** — Change "Unknown" to "Anonymous Challenger".
- [ ] **Fix card shop day display for non-UTC timezones.**
- [ ] **Make battle console expandable/collapsible.**

---

#### ⚫ Day 8: Code Quality & Cleanup

- [ ] **Remove pass-through arena module files** — 20 files in `lib/arena/` are one-liners (`module.exports = require("./arena-core")`).
- [ ] **Extract constants block from arena-core.js top** — ~130-line header to `lib/arena/_constants.js`.
- [ ] **Add JSDoc types to key combat functions.**
- [ ] **Fix `dailyOpponentCount` SQL boundary** — Compare `lastOpponentDate` to a computed date boundary instead of `datetime('now', '-5 hours')`.

---

#### ⭐ Day 9: Testing & Validation

- [ ] **Add unit tests for combat formulas** — `calculateAttackOutcome`, `computeMaxHp`, `computeEvasionChance`, `calculateEloExchange`.
- [ ] **Add integration tests for passives in combat.**
- [ ] **Add regression test for 60-turn timeout** — Verify tiebreaker uses HP% not raw HP.
- [ ] **Add NPC opponent scaling test.**
- [ ] **Add max-level + all-consumables scenario test** — Verify damage doesn't exceed cap.
- [ ] **Run full backend test suite** — `cd mirabellier-backend && npm test`. 89 tests, 50 pass, 39 fail. Target: 80+/89.

---

#### 📊 Day 10: Documentation & Monitoring

- [ ] **Document all combat formulas** — Create `docs/arena-combat.md`.
- [ ] **Add Arena admin dashboard metrics** — Fights/day, win rate, economy inflow/outflow.
- [ ] **Add runtime balance monitoring** — Alert when player exceeds thresholds (damage > 1000, evasion > 50%, streak > 100).
- [ ] **Document consumable stacking rules** — How effects interact, caps, limits.

## Frontend cleanup

- Clean up remaining meaningful lint warnings:
  - Replace `any` in `Blog.tsx` and `Post.tsx`.
  - Remove or gate stray frontend `console` statements.
  - Fix missing hook dependencies in `BlogEdit.tsx`, `Guestbook.tsx`, and `QuestionOfTheDay.tsx`.
  - Split shared helpers/constants out of component files that trigger `react-refresh/only-export-components` where practical.
- Review Tiptap dependency warnings separately; some may be acceptable vendor/template noise, but document any intentional ignores.

## Performance and build improvements

- Reduce production bundle budget warnings from `npm run build`.
  - CSS `assets/index-*.css` is about 125 kB, over the 100 kB budget.
  - Main JS `assets/index-*.js` is about 473 kB, over the 450 kB chunk budget.
- Optimize or lazy-load `back-card-design` image; current build asset is about 2.35 MB.
- Check whether the many tiny sprite JS chunks are intentional. If not, consolidate sprite asset loading so the build output is less noisy and cheaper to request.
- Keep Tiptap/simple editor chunks lazy-loaded; verify the editor code is not pulled into routes that do not need it.

## Verification notes

- `cd mirabellier-backend && npm test` currently fails: 89 tests total, 50 pass, 39 fail.
