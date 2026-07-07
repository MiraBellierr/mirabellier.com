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

- [x] **Fix `dailyOpponentCount` reset logic** — Reset defender appearances on day rollover and when that player actively fights.
- [x] **Fix 60-turn tiebreaker** — Use HP **percentage** (`playerHp/maxPlayerHp` vs `opponentHp/maxOpponentHp`).
- [x] **Fix `selfRevive` trigger scope** — Treat Chrono Vial as a KO revive (HP ≤ 0), with Phoenix Feather taking priority when both are active.
- [x] **Fix leaderboard XP progress formula** — Change SQL from `40` to `25` to match `xpToNext()`.
- [x] **Fix `consumeFightBoostDurations` only on wins** — Decrement boost durations every fight, not just on wins.

---

#### 🟠 Day 2: Consumable Caps & Combat Fairness

- [x] **Give NPC opponents equipment & skill tree bonuses** — Add `equipmentBonus` multiplier to NPC templates, scaled by level.
- [x] **Add loss consolation** — Grant 25–50% of win XP on loss.
- [x] **Add combined consumable damage cap** — Clamp total damage multiplier (statSteroid × damageBoost × element × crit) at 4.0–5.0×.
- [x] **Add consumable inventory per-item cap** — Max 99 per item type or 999 total inventory items.
- [x] **Limit simultaneous active consumable effects** — Max 3–4 active consumable effects at once; using a new one replaces the oldest.

---

#### 🟡 Day 3: Stat & Economy Balancing

- [x] **Rebalance HP formula** — Reduce guard multiplier from 1.5 to 1.0: `guard * 1.0 + (power + speed) * 0.8`.
- [x] **Cap win-streak XP bonus** — `Math.min(Math.log2(winStreak + 1), Math.log2(6)) * 3` (cap at streak 5).
- [x] **Add streak coin multiplier** — `+2% coins per streak, capped at +30%`.
- [x] **Cap element effectiveness** — Clamp `1.3 + effectHit * 0.02 - defenderEffectHit * 0.01` at 1.8×. Give `effectHit` a secondary effect (e.g., 1% shield pierce per 10 pts).
- [x] ~~**Reduce evasion cap** — From 60% to 44%.~~ ✅ DONE — Combat evasion clamp is now 44%.
- [x] **Add max-level overflow** — Convert excess XP to coins at level 70 (1 XP = 1 coin).
- [x] Edit and display user-friendly UI for consumables active effects in inventory
- [x] Display good naming for equipments for user-friendly UI
- [x] when the user wants to buy consumable that will exceed 6 effects, make the user able to choose which consumable to be replaced.

---

#### 🟢 Day 4: Equipment System Improvements

- [x] **Tighten substat roll ranges** — `dmgPct: [10, 20]`, `critDmg: [15, 50]`, `defendPct: [10, 25]`, `hpPct: [3, 10]`, `critRate: [8, 20]`.
- [x] **Add equipment enhancement system** — Spend coins + fodder pieces for +1 main stat per level, +1 to +15 with exponential costs.
- [x] **Add "reroll one substat" feature** — 500 coins + 1 fodder piece, pick one substat to reroll.
- [x] **Fix `hpPct` display in profile** — Factor `hpPct` into displayed HP in `toPublicProfile`.
- [x] **Rename substat `crit` → `critRate`** in `SUB_STAT_POOL` for consistency.

---

#### 🔵 Day 5: Consumable & Effect Tuning

- [x] **Remove unused consumables**.
- [x] **Document & enforce consumable stacking rules** — Same-type values stay fixed while charges/durations increase; different effect types stack through combat with a global cap.
- [x] **add sort, filter and search like in collection into mint page**

---

#### 🟣 Day 6: AFK Quality of Life

- [x] **Remove hide page stop**: hiding pages wont stop the auto fight anymore. but minimizing the browser will stop it.
- [x] **Add auto-fight stop conditions** — Stop on loss, on level-up, after N fights.
- [x] **Add session summary** — "While you were away: W wins, L losses, +XP, +coins, Lv↑."
- [x] **Add fight speed setting** — Normal, Fast (2×), Instant.
- [x] change consumable effect to be capped from 6 to 4.


---

#### ⚪ Day 7: UI Polish & Visual Fixes

- [x] **Show active passives in pre-fight summary.**
- [x] **Fix NPC fallback display name** — Change "Unknown" to "Anonymous Challenger".
- [x] **Fix card shop day display for non-UTC timezones.**
- [x] **Make battle console expandable/collapsible.**

---

#### ⚫ Day 8: Code Quality & Cleanup

- [x] **Remove pass-through arena module files** — 20 files in `lib/arena/` are one-liners (`module.exports = require("./arena-core")`). ✅ DONE — All `lib/arena/` files now contain real domain code after the 2026-06-28 refactor; `arena-core.js` was replaced by the module hub at `lib/arena/index.js`.
- [x] **Extract constants block from arena-core.js top** — ~130-line header to `lib/arena/_constants.js`. ✅ DONE — Constants extracted from `utils.js` to `lib/arena/_constants.js`; `utils.js` re-exports them via destructured require.
- [x] **Add JSDoc types to key combat functions.** ✅ DONE — JSDoc added to `calculateAttackOutcome`, `computeMaxHp`, `computeEvasionChance`, `calculateEloExchange`, `calculateRoundPower`, `resolveRoundWinner`, `loadCombatSnapshot`, `computeElementMultiplier`, `buildPassiveRuntime`, `runPassivesForTrigger`, `buildNpcOpponent`, `simulateFight`, `applyLevelUps`, `convertMaxLevelOverflowXp`, `calculateStreakXpBonus`, `calculateWinXp`, `calculateLossXp`, `calculateStreakCoinMultiplier`, `calculateWinCoins`, `computeShieldPiercePct`, `computeReviveHp`, `consumeTempGuard`, `chooseEloOpponent`, `xpToNext`, `rarityRank`, `isEloProvisional`, `getEloKFactor`.
- [x] **Fix `dailyOpponentCount` SQL boundary** — Compare `lastOpponentDate` to a computed date boundary instead of `datetime('now', '-5 hours')`.

---

#### ⭐ Day 9: Testing & Validation

- [x] **Add unit tests for combat formulas** — `calculateAttackOutcome`, `computeMaxHp`, `computeEvasionChance`, `calculateEloExchange`.
- [x] **Add integration tests for passives in combat.** ✅ DONE — Live combat test covers attack and damage-taken passive modifiers.
- [x] **Add regression test for 60-turn timeout** — Verify tiebreaker uses HP% not raw HP.
- [x] **Add NPC opponent scaling test.**
- [x] **Add max-level + all-consumables scenario test** — Verify damage doesn't exceed cap.
- [x] **Run full backend test suite** — `cd mirabellier-backend && npm test`. ✅ DONE — 171 tests, 171 pass.

---

#### 📊 Day 10: Documentation & Monitoring

- [x] **Document all combat formulas** — Create `docs/arena-combat.md`.
- [x] **Add Arena admin dashboard metrics** — Fights/day, win rate, economy inflow/outflow.
- [x] **Add runtime balance monitoring** — Alert when player exceeds thresholds (damage > 1000, evasion > 50%, streak > 100).
- [x] **Document consumable stacking rules** — How effects interact, caps, limits.

## TCG page UX cleanup

### Current bugs and friction to fix

- [x] **Split TCG into route-level pages** — Use `/arena/tcg/decks` for deck building and `/arena/tcg/match` for match play; redirect `/arena/tcg` to `/arena/tcg/decks`. Mirror under `/ar/tcg/decks` and `/ar/tcg/match`.
- [x] **Use Arena subnav on TCG pages** — Add `ArenaSubNav` to deck and match pages; update the TCG subnav link to land on `/tcg/decks`.
- [x] **Remove local tab state as navigation** — Replace the in-page `[ Decks ] | [ Match ]` tab UI with real routes so refresh/back/forward/deep links work correctly.
- [x] **Resume active games from backend** — Add frontend API helper for existing `/tcg/active-game`; use it when `tcg_active_game` is absent or stale.
- [x] **Fix unstable hidden-hand keys** — Replace `key={Math.random()}` in hidden opponent hand rendering with stable keys.
- [x] **Make staging notice one-time** — Persist acknowledgement in localStorage; after acknowledgement, show only a small inline alpha/staging notice.
- [x] **Preserve website theme and layout** — Keep `Header`, left `Navigation`, `Footer`, `Divider`, `card-border` page frame, right-side panels where useful, dark mode behavior, and existing Arena visual language.
- [x] **Avoid generic card-style information blocks** — Do not display rules/status/instructions as standalone card-like info boxes. Use compact page bands, inline status rows, toolbars, board rails, right-side panels, and table/list rows instead.

### Decks page plan

- [x] **Create `TcgDecks` page** — Focus on deck construction only: selected deck, collection search/sort/filter, element spawn selection, and play CTAs.
- [x] **Make deck readiness obvious** — Show `0/10` through `10/10` in the page header/status band; disable play CTAs until deck is valid.
- [x] **Keep selected deck visible without card-style info panels** — Use a horizontal selected-card rail and compact toolbar, not explanatory cards.
- [x] **Improve collection controls** — Keep search, rarity/IV/stat sorting, element filter, and duplicates filter; make controls match Arena collection/mint patterns.
- [x] **Add clear deck actions** — `Clear deck`, `Play solo`, `Play AI`, and `Find match`; route successful starts/matches to `/arena/tcg/match`.
- [x] **Persist user choices** — Continue using `tcg_deck` and `tcg_element_pool` localStorage keys.

### Match page plan

- [x] **Create `TcgMatch` page** — Own active game state, queue state, board interactions, game resume, websocket handlers, and action submission.
- [x] **Show one dominant game status band** — Current turn, score, timer, queue state, last action, and active-player state must be visible above the board.
- [x] **Keep drag/drop but add click alternatives** — Every important action needs a click path: draw, place, promote, assign energy, attack, switch, end turn, forfeit.
- [x] **Make valid actions self-evident** — Highlight only valid targets/actions; disabled controls should explain what is missing with short inline text.
- [x] **Improve mobile interaction** — Use large touch targets for action controls and energy/actions; avoid drag-only interactions on touch devices.
- [x] **Clarify board zones** — Label attacker, support, hand, draw, discard, active energy, and score with compact zone labels that do not resize the board.
- [x] **Reduce visual noise during play** — Keep animations purposeful: attack projectile, damage float, and shake are enough; avoid extra decorative containers.
- [x] **Move rules/help to right panel or collapsible compact rail** — Keep the board primary; rules should not compete with live match state.
- [x] **Keep finished state actionable** — Show final score, winner/loser label, and `Play again` / `Back to decks` actions.

### Shared TCG refactor tasks

- [x] **Extract shared TCG helpers/components** — Move card thumbnail, tooltip, board, hand, piles, countdown, mobile drag ghost, storage helpers, sorting/filtering, and action predicates out of the monolithic page. ✅ DONE — Extracted into `src/lib/tcg-constants.ts`, `src/lib/tcg-utils.ts`, `src/components/tcg/*` (13 component files), and `src/hooks/use-tcg.ts`. `TcgPage.tsx` deleted; `TcgDecks.tsx` and `TcgMatch.tsx` are standalone pages.
- [x] **Add `fetchActiveTcgGame` API helper** — Small frontend-only client addition for `/tcg/active-game`.
- [x] **Update SEO/title metadata** — Deck page: `TCG Decks`; match page: `TCG Match`; update header route titles.
- [x] **Keep backend schema unchanged** — Do not change TCG database tables or game rules for this UI pass.
- [x] **Verification** — Run `npm run build`; manually verify `/arena/tcg`, `/arena/tcg/decks`, `/arena/tcg/match`, `/ar/tcg`, `/ar/tcg/decks`, `/ar/tcg/match`, deck persistence, solo/AI start, PvP queue, active game resume, click actions, drag/drop actions, mobile layout, and dark mode. ✅ DONE — `npm run build` passes (1016 modules transformed).

### TCG UI research notes

- **Status visibility:** Nielsen Norman Group emphasizes keeping users informed about current state and action feedback; apply this to turn, timer, queue, score, action pending, and last action display. Source: https://www.nngroup.com/articles/visibility-system-status/
- **Drag/drop should not be the only path:** NN/g and drag/drop UX guidance recommend clear signifiers, feedback, and accessible alternatives; apply this with click actions plus drag/drop. Sources: https://www.nngroup.com/articles/drag-drop/ and https://www.pencilandpaper.io/articles/ux-pattern-drag-and-drop
- **Touch targets:** Material Design recommends 7–10mm touch targets; apply this to match actions, energy assignment, draw/end/forfeit buttons, and mobile controls. Source: https://m3.material.io/foundations/designing/structure
- **Game UI focus:** Game UI guidance stresses flexible layouts, legibility, responsive touch controls, and keeping game UI aligned with the game goal; apply this by prioritizing board state over explanatory panels. Sources: https://developer.apple.com/videos/play/meet-with-apple/243/ and https://www.gamedeveloper.com/design/upping-your-game-s-usability
- **Card-game readability:** Card game UI/design writeups highlight clear hierarchy, icon support beyond color, large readable titles, and iteration through testing; apply this to element labels, rarity/element display, and board zone naming. Sources: https://medium.com/%40acbassettone/5-ux-ui-lessons-from-designing-a-card-game-b689d3f3187 and https://medium.com/%40impulselimited/ui-design-for-a-2d-3d-card-game-b0824867b0a3

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

- `cd mirabellier-backend && npm test` passes: 171 tests total, 171 pass.
- `npm run build` passes with existing bundle-budget warnings: CSS ~130 kB over 100 kB, main JS ~474 kB over 450 kB, and `back-card-design` ~2.35 MB.
