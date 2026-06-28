# TODO

## TCG bugs and fixes

- Make timeout automatically end the TCG match into the game-over UI without requiring the player to submit an action.
  - Backend already finalizes timeout when `getGameState` or `submitAction` runs.
  - Frontend should poll/refresh active games near timeout, or backend should push a websocket finish event on timeout.
- Fix the TCG draw-pile/attack edge case.
  - Backend `mustDraw` skips empty draw piles now, but add regression tests for "can attack/end when draw pile is empty".
  - Make sure the frontend does not show stale "draw first" messaging when `drawPile.length === 0`.
- Fix AI draw logic in `mirabellier-backend/lib/tcg-ai.js`.
  - `drawPile` stores card IDs, but AI currently pushes the raw ID into `hand`.
  - Use the full deck lookup, matching `removeFromDrawPile` in `tcg-service.js`, so AI hand cards stay full card objects.
- Add drag animation/ghost feedback on phone for TCG touch dragging.
- Add tests for TCG KO/no-card states: if a player has no attacker, no support, no hand, and no draw pile, the game should end cleanly instead of leaving an unwinnable turn.
- Consider letting energy be used for redrawing regardless of element, then update UI copy and validation to match.

## Arena fixes

- Add card sacrifice/fodder for coins.
  - Include duplicate safeguards, confirmation UI, coin payout rules by rarity/IV, and tests that selected/listed/traded cards cannot be sacrificed accidentally.
- Add friendship/affinity for frequently used characters.
  - Track usage per character/card owner.
  - Award small power or stat boosts at affinity thresholds.
  - Show affinity on card/profile UI so players understand why sticking with a character matters.
- Add drag support to Arena minting.
- Investigate ArenaFight hook dependency warnings in `src/pages/ArenaFight.tsx`; stale `activeFight` or HP deps could cause resume/animation state to desync.
- Make active fight resume/retry behavior testable so interrupted fights cannot get stuck between active and finished states.

---

## 🔴 Arena Game Audit (2026-06-28)

*Full analysis of Arena combat, stats, gear, equipment, economy, and AFK design. Excludes TCG.*

---

### ⚠️ Critical Bugs

1. **Gear passives never activate in combat (catalog v3 regression)**
   - `resolveActivePassives()` reads from old `arena_equipment` table via `getEquippedRows()`.
   - Catalog v3 replaced gear with `arena_equipment_pieces` (weapon_roll / armour_roll / charm_roll).
   - Old table is empty post-migration → **zero gear passives fire in combat**.
   - All tier gear (Rustblade, Dawnfang Blade, etc.) have no acquisition path — recipes exist with no inputs, and `price: 0` means they can't be bought.
   - *Files:* `combat.js` lines ~1010–1080 (`resolveActivePassives`, `getEquippedRows`), `arena-constants.js` lines ~670–696 (`buildRecipes` only creates consumable recipes).

2. **`dailyOpponentCount` reset is called on wrong user**
   - `resetDailyOpponentCount(db, current.userId)` resets the attacker's count every fight — but this counter tracks how often you've been *used as an opponent* (defender). The reset should apply to the opponent or only trigger on day rollover.
   - `incrementDailyOpponentCount` uses `datetime('now', '-5 hours')` as a SQL literal — timezone/boundary edge cases possible.
   - *Files:* `combat.js` lines ~5245–5277.

3. **NPC opponents missing equipment & skill tree stats**
   - `buildNpcOpponent()` provides only base profile stats × `statScale`. No equipment pieces, no skill tree bonuses.
   - Real players get `computeEquipmentStats` + `getSkillState` added via `loadCombatSnapshot`.
   - At higher levels, NPCs are significantly weaker than equivalently-leveled real players (gap widens with better gear/skills).
   - *Files:* `combat.js` lines ~5300–5370 (`buildNpcOpponent`), ~4600–4700 (`loadCombatSnapshot`).

4. **Fight stuck at 60-turn cap: tiebreaker uses HP as "power"**
   - When `maxTurns = 60` is reached and both survive, `resolveRoundWinner` is called with `playerPower: playerHp` (HP value, not power stat). This is semantically wrong — the tiebreaker should compare remaining HP% or a different formula.
   - *Files:* `combat.js` lines ~6170–6200.

5. **`selfRevive` triggers on ANY hp threshold, not just KO**
   - `selfRevive` check runs `if (opponentHp > 0 && ... hpPct <= threshold)` — this fires mid-fight when HP drops below threshold, restoring full HP. Intended design is unclear: should it be a one-time KO revive or a mid-fight full heal?
   - Combined with `deathSave` (survive KO at 1 HP), the interaction is undefined: both can fire on the same hit.
   - *Files:* `combat.js` lines ~6030–6060.

---

### 🔧 Technical Issues

6. **Massive code duplication across all arena modules**
   - Every module in `lib/arena/` (~19 files) copies the same ~130-line header: constants imports, websocket helpers (`_wsEmit`, `_notifyUser`, `_notifyUsers`, `_notifyUnreadCount`), and ~100 lines of redefined constants.
   - Creates maintenance burden, risk of constants getting out of sync.
   - *Fix:* Extract shared header into `lib/arena/_common.js`.

7. **`rollFightMaterialRewards()` is a stub returning `[]`**
   - Materials/crafting system is defined in constants (SHOP_ITEMS, SHOP_RECIPES) but no materials ever drop from fights.
   - Consumables are crafted with coin-only recipes — material inputs are `[]`.
   - *Files:* `combat.js` line 4850, `arena-constants.js` lines ~670–696.

8. **Equipment substat `crit` and `critDmg` conflated with `critChancePct`**
   - Substats use `"crit"` → maps to `pctStats.critChancePct`. Main stat on charms uses `"critRate"` → also maps to `pctStats.critChancePct`. Different names for the same stat is confusing.
   - `critDmg` from subs and `critDmg` from main stat both map to `pctStats.critDmgPct` — OK but naming inconsistent.
   - *Files:* `arena-constants.js` lines ~90–113 (SUB_STAT_POOL), `combat.js` lines ~1310–1340.

9. **ELO matchmaking pool small for low-population periods**
   - `ELO_MATCHMAKING_POOL_SIZE = 5`, `ELO_MATCHMAKING_CANDIDATE_LIMIT = 20`. With few active players, matchmaking falls back to NPCs — but NPCs have no ELO gain.
   - *Files:* `combat.js` lines ~88–91.

10. **`computeEquipmentStats` doesn't apply `hpPct` to the returned flat stats**
    - `hpPct` is returned separately in `pct` object. `computeMaxHp` applies it correctly, but `toPublicProfile` shows `equipmentStats.hp` without the `hpPct` multiplier, causing a display discrepancy.
    - *Files:* `combat.js` lines ~1300–1360, ~4859–4866.

11. **No input validation on equipment piece roll costs**
    - `rollEquipmentPiece` costs 1000 coins per roll (hardcoded in `ROLLABLE_EQUIPMENT.price`). But there is no coin check in the roll endpoint — caller must validate separately.
    - *Files:* `arena-constants.js` lines ~56–88.

---

### ⚖️ Game Balancing Issues

#### Stats & Leveling

12. **HP formula over-values `guard` stat**
    - `computeMaxHp`: `hpBase + guard * 1.5 + (power + speed) * 0.7`. Guard contributes 2.14× more to HP than power/speed.
    - A guard-heavy build gets both high defense AND high HP. Power builds are fragile.
    - *Suggestion:* Reduce guard multiplier to 1.0 and increase base HP contribution.

13. **XP formula creates extreme snowball for streakers**
    - `Math.floor(Math.log2(winStreak + 1)) * 3` — at streak 127 this is +21 XP/fight. Combined with XP boosts (100%+ from consumables) and rarity coin passives, high-streak players level 3–4× faster.
    - For an AFK game, this encourages never logging out (streak resets on loss).
    - *Suggestion:* Cap streak XP bonus at ~5 consecutive wins. Add a small "rested" bonus for returning after inactivity (not offline rewards, but a catch-up mechanic).

14. **Coin economy bottlenecks at high levels**
    - Win coins: `18 + oppLevel * 5 + rarityCoinReward` → at level 70 vs UR: 18 + 350 + 18 = 386 coins.
    - Equipment rolls cost 1000 each. Card shop: UR = 10000 coins. Skill reset: `level * 100` (up to 7000).
    - A player earning ~350 coins/win needs ~3 fights for one gear roll, ~29 fights for one UR card.
    - No coin scaling with win streak — unlike XP.
    - *Suggestion:* Add streak coin multiplier (capped), or reduce equipment roll costs at higher levels.

15. **Element effectiveness scaling is unbounded with `effectHit`**
    - Formula: `1.3 + attackerEffectHit * 0.02 - defenderEffectHit * 0.01`.
    - At 35 effectHit: `1.3 + 0.7 = 2.0×` multiplier. Combined with base 1.3 element multiplier from constants, this becomes ~2.6× effective.
    - `effectHit` has no other combat use — it only affects element multiplier.
    - *Suggestion:* Cap element effectiveness at 1.8× total. Give `effectHit` a secondary effect (e.g., small chance to pierce shield or reduce evasion).

16. **Evasion formula can reach problematic levels**
    - Base: 4% + defenderSpeed * 0.004 - attackerSpeed * 0.002 + extraEvasionPct/100.
    - At speed 100 vs speed 50: 4% + 0.4 - 0.1 = 4.3% base.
    - But with gear passives (+3% from Azure Ring), skill tree Swiftness (+9 speed), and evade consumable (+95% possible!), evasion can exceed 60% cap easily.
    - *Suggestion:* Reduce evasion cap from 60% to 35%. Evasion is frustrating in AFK games — players can't react to RNG misses.

#### Equipment & Gear

17. **Equipment substat variance is too extreme (5:1 ratio)**
    - `dmgPct: [5, 20]` — best roll is 4× worst. `critDmg: [10, 60]` — 6× variance.
    - A player rolling 4 bad substats wastes 1000 coins with no pity/upgrade path.
    - *Suggestion:* Tighten ranges (e.g., `dmgPct: [10, 20]`), add a "reroll one substat" feature for a coin cost, or allow foddering pieces to boost another piece's substats.

18. **No equipment upgrade/progression system**
    - Equipment pieces are one-and-done: roll → equip or fodder for 500 coins.
    - No way to improve a piece you like. This hurts long-term engagement.
    - *Suggestion:* Add equipment enhancement: spend coins + fodder pieces to increment main stat or reroll one substat. Add enhancement levels (e.g., +1 to +15) with increasing costs and failure risk at high levels.

19. **Only 3 equipment slots with no diversity**
    - Weapon (power roll), Armour (guard roll), Charm (critRate or critDmg roll).
    - No accessories, no set bonuses, no elemental gear.
    - *Suggestion:* Add 1–2 more slots (e.g., ring, boots). Add tiered gear sets with 2-piece and 3-piece bonuses.

#### Consumables & Effects

20. **Consumable duration limits are inconsistent**
    - `coinBoostWinsRemaining: 40` vs `expBoostWinsRemaining: 500` — coin boost lasts 12.5× fewer fights. Makes coin consumables feel bad.
    - `gateKeyCharges: 4` but fight cooldown is only 5 seconds — near-useless for an AFK game.
    - *Suggestion:* Normalize durations. For AFK play, consumables should last hours, not fights. Consider time-based durations instead of fight-count-based.

21. **Consumable stacking is undefined**
    - Can you have both `damageBoost` and `statSteroid` active? Both affect power — do they stack additively or multiplicatively? Current code: `statSteroid` multiplies base stats, then `damageBoost` adds % to attack damage. They stack multiplicatively → potential for extreme burst.
    - *Suggestion:* Document stacking rules. Cap total damage multiplier (e.g., +200% max).

22. **No anti-snowball mechanics for losers**
    - Losing a fight: streak resets to 0 (unless streak shield consumable), no XP/coins, no consolation.
    - For an AFK game where users leave devices running, a bad RNG loss streak is punishing.
    - *Suggestion:* Grant small loss XP (25–50% of win XP). Keep streak as the bonus, not the baseline.

#### AFK-Specific Design

23. **No fight speed setting for AFK mode**
    - The game has fight animations but no "speed up" or "skip animation" toggle.
    - AFK players want instant results, not 60-turn animations.
    - *Suggestion:* Add "Instant Resolve" toggle in Arena settings. Skip animation, show result immediately.

24. **No auto-fight / loop-fight mode**
    - Players must click "Fight" for each battle. For an AFK game, this is tedious.
    - *Suggestion:* Add "Auto-Fight" toggle: automatically starts next fight after cooldown. Stops on loss, level-up, or inventory full. Show summary after stopping.

25. **No session summary or idle report**
    - When returning after AFK, players see nothing — they have to check profile for changes.
    - *Suggestion:* Show a "While you were away" summary: fights won/lost, XP gained, levels gained, coins earned, cards drawn, items used.

---

### 👁️ Visual / UI Bugs

26. **Equipment piece stats display may not include `hpPct` contribution**
    - `toPublicProfile` returns equipment stats without `hpPct` factored into `total.hp`. `computeMaxHp` uses it correctly for combat, but the displayed total HP may differ from combat effective HP.

27. **Passive effects from skill tree not shown in pre-fight UI**
    - `activePassives` from skill tree are computed server-side but the frontend may not display which passives are active before a fight.

28. **Card shop "Random Card" offer only available Sun/Tue/Thu/Sat**
    - The day check uses UTC (`getUTCDay()`). Players in timezones far from UTC may see the offer available/unavailable at unexpected times relative to their local day.

29. **Fight console log not surfaced in UI**
    - `battleConsole` is computed and returned in the fight response but may not be displayed anywhere in the frontend. Valuable for debugging and player understanding of what happened.

30. **NPC opponents always show as "Unknown" if user row missing**
    - `selectOpponentForFight` queries `users` table for display name. If the real opponent's user row is missing, they show as "Unknown" — should fall back to "Anonymous Challenger" or similar.

---

### 📋 Day-by-Day Improvement Plan

#### Day 1: Critical Bug Fixes
- [ ] **Fix gear passives** — Rewire `resolveActivePassives` to read from `arena_equipment_pieces` instead of old `arena_equipment`. Map piece main/sub stats to passive keys. Add migration to populate passive mappings for existing pieces.
- [ ] **Fix tier gear acquisition** — Either add recipe inputs to `buildRecipes()` for gear items, or add them to a gear shop with coin prices. Currently 24 gear items exist in constants with no way to obtain them.
- [ ] **Fix `dailyOpponentCount` reset logic** — Only reset on actual day boundary (compare `lastOpponentDate` to current date, not 5-hour window). Don't reset attacker's count on fight.

#### Day 2: Combat Fairness
- [ ] **Fix 60-turn tiebreaker** — Use HP percentage comparison instead of passing HP as "power" stat. Add clear combat log message: "Battle timed out — winner decided by remaining HP."
- [ ] **Fix `selfRevive` behavior** — Clarify design intent. If meant as KO revive: only trigger when HP ≤ 0. If meant as low-HP heal: rename to `Last Stand`. Prevent double-fire with `deathSave`.
- [ ] **Give NPC opponents equipment bonuses** — Scale NPC stats to approximate an average-equipped player at that level. Add a `equipmentBonus` multiplier to NPC templates.

#### Day 3: Code Quality
- [ ] **Extract shared arena module header** — Create `lib/arena/_common.js` with all shared imports, websocket helpers, and constants. Refactor all 19 modules to `require('./_common')`.
- [ ] **Add input validation for equipment rolling** — Check coin balance server-side before deducting. Return proper error code if insufficient coins.
- [ ] **Fix `hpPct` display in profile** — Include percentage-based HP in `toPublicProfile` total stats display.

#### Day 4: Stat & Economy Balancing
- [ ] **Rebalance HP formula** — Reduce guard→HP multiplier from 1.5 to 1.0. Increase base HP contribution. Formula: `max(30, hpBase * 1.5 + guard * 1.0 + (power + speed) * 0.8) * (1 + hpPct/100)`.
- [ ] **Cap win-streak XP bonus** — Max bonus at 5 consecutive wins: `Math.min(Math.log2(winStreak + 1), Math.log2(6)) * 3`. Alternatively, add diminishing returns.
- [ ] **Add streak coin multiplier** — `+2% coins per streak, capped at +30%`. Makes coin economy scale with performance.
- [ ] **Cap element effectiveness** — Max multiplier clamp at 1.8× (down from potential 2.6×). Add small shield-pierce chance to effectHit (1% per 10 points).

#### Day 5: Equipment System Overhaul
- [ ] **Tighten substat roll ranges** — `dmgPct: [10, 20]`, `critDmg: [15, 50]`, `defendPct: [10, 25]`, `hpPct: [3, 10]`. Reduce variance from 5:1 to 2–3:1.
- [ ] **Add equipment enhancement system** — Spend coins + fodder pieces to increase main stat by +1 per level. Enhancement levels +1 to +15. Cost scales exponentially. Add pity timer (guaranteed success after N failures).
- [ ] **Add "reroll one substat" feature** — Cost: 500 coins + 1 fodder piece. Pick one substat to reroll, others stay.

#### Day 6: Consumable & Effect Tuning
- [ ] **Normalize consumable durations** — Make coin boost 250 fights (matching others). Make gate key 50 charges (or remove it — 5s cooldown is negligible for AFK).
- [ ] **Document consumable stacking rules** — Additive for same-type effects, multiplicative across types. Cap total damage multiplier at +200%.
- [ ] **Add loss consolation** — Grant 25–50% of win XP on loss. Streak shield is nice but harsh without it.
- [ ] **Implement material drops** — `rollFightMaterialRewards()` should return 0–2 random materials per win based on opponent level. Add materials as recipe inputs.

#### Day 7: AFK Quality of Life
- [ ] **Add "Instant Resolve" toggle** — Skip fight animation, show result card immediately. Store preference in profile.
- [ ] **Add "Auto-Fight" mode** — Automatically queue next fight after cooldown. Stop conditions: on loss, on level-up, on empty card, after N fights, on low HP.
- [ ] **Add session summary** — Track fights since page load. Show summary modal when returning to Arena tab: "While you were away: 23 wins, 2 losses, +4500 XP, +12000 coins, 1 level up."
- [ ] **Add fight speed setting** — Normal (current), Fast (2×), Instant. Affects animation playback timing.

#### Day 8: UI Polish & Visual Fixes
- [ ] **Show active passives in pre-fight summary** — List all gear passives + skill tree passives with descriptions.
- [ ] **Surface battle console in fight playback** — Show expandable combat log under fight results.
- [ ] **Fix card shop day display for non-UTC timezones** — Use local day calculation based on user preference or server timezone offset.
- [ ] **Fix NPC fallback display name** — Use "Anonymous Challenger" instead of "Unknown" when user row missing.

#### Day 9: Testing & Validation
- [ ] **Add unit tests for combat formulas** — `calculateAttackOutcome`, `computeMaxHp`, `computeEvasionChance`, `calculateEloExchange`.
- [ ] **Add integration tests for equipment passives in combat** — Verify passives fire correctly with new equipment pieces system.
- [ ] **Load-test fight simulation** — Verify 60-turn cap performance, concurrent fight handling.
- [ ] **Run full backend test suite** — `cd mirabellier-backend && npm test`. Current: 50/89 pass. Target: 80+/89.

#### Day 10: Documentation & Monitoring
- [ ] **Document all combat formulas** — Create `docs/arena-combat.md` with damage formula, HP formula, evasion, element effectiveness, XP/coin rewards.
- [ ] **Add Arena admin dashboard metrics** — Track: fights/day, avg fight duration, win rate distribution, most-used cards, most-used gear, economy inflow/outflow.
- [ ] **Add runtime balance monitoring** — Log when any player exceeds expected stat thresholds (e.g., damage > 1000 in one hit, evasion > 50%). Alert on anomalies.

## Frontend cleanup

- Fix `src/pages/TcgPage.tsx` hook warning by wrapping `handleAction` in `useCallback`; it currently changes every render and churns `handleMobileTcgDrop`.
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

- `npm run lint` passes with warnings only.
- `npm run build` succeeds, but reports CSS and JS budget warnings.
- `cd mirabellier-backend && npm test` currently fails: 89 tests total, 50 pass, 39 fail.
