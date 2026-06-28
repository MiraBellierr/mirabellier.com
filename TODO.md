# TODO

## Critical bugs

- [x] Fix backend Arena test suite failures. Current run: `npm test` in `mirabellier-backend` = 89 pass / 0 fail.
  - [x] Update `test/arena-service.test.js#createTestDb` so the in-memory schema matches production schema in `lib/db.js`.
  - [x] Add missing `arena_equipment_loadouts` table to the test DB.
  - [x] Stop defaulting test profiles to `catalogVersion: "v2"` when current `CATALOG_VERSION` is `"v3"`, or make tests explicitly opt into migration cases.
  - [x] Prefer a shared schema/bootstrap helper for tests so production schema and test schema cannot drift again.
- [x] Fix ELO opponent selection regression. Test "ELO matchmaking prefers nearby ratings and avoids recent opponents" expects `u3` but gets `u2`, so recent-opponent avoidance or rating-distance ordering is wrong.
- [x] Fix playback fight reward persistence. Test "playback fight state keeps finalized exp and coin rewards" fails after finalization, so finalized rewards are not being exposed or retained consistently.
- [x] Remove `[HIGHER_RARITY_BONUS]` debug `console.log` calls from `mirabellier-backend/lib/arena/legacy-service.js`; they pollute test output and production logs.

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

## Arena balancing improvements

### P1 — Guard double-dips HP + defense (dominant stat) ✅
- **Problem:** Every point of Guard gives +2.2 HP (via `computeMaxHp`) AND +1.6 to defense rolls, making it the optimal stat in all situations.
- **Fix (`computeMaxHp` in `mirabellier-backend/lib/arena/combat.js`):**
  - Reduce `guardBonus` multiplier from `2.2` → `1.5`.
  - Increase `(power + speed)` multiplier from `0.35` → `0.7`.
  - This creates three viable builds: Power (damage), Guard (mitigation), Speed (HP + turn order + evasion).

### P2 — Speed is a dead stat ✅
- **Problem:** Evasion scaling is `defSpeed * 0.002` — a 10-point speed advantage gives only +2% evasion. Turn order is `speed + random(0,8)`, drowning speed in RNG.
- **Fix A (`computeEvasionChance`):** Increase evasion scaling: `defSpeed * 0.002` → `defSpeed * 0.004` and `atkSpeed * 0.001` → `atkSpeed * 0.002`.
- **Fix B (turn order in `simulateFight`):** Reduce initiative random range from `randomInt(0, 8)` → `randomInt(0, 4)` so speed matters twice as much.

### P4 — XP curve too steep at high levels ✅
- **Problem:** `xpToNext = 80 + 40 * level²`. Level 69→70 = 190,520 XP needed ÷ ~200 XP/win = ~953 wins = 32 days of all-wins at 30 fights/day.
- **Fix:** Soften quadratic: `40 * level²` → `25 * level²`. Then 69→70 = ~119K XP = ~595 wins (still grindy but less absurd).
- **Alternative:** Add XP scaling by player level in `calculateWinXp` so higher-level players earn proportionally more.

### P5 — Coin economy too tight ✅
- **Problem:** Cosmic-tier materials cost 52,000–60,000 coins. At ~246 coins/win (Lv70 + UR), that's ~220 wins per single material.
- **Fixes applied:**
  - ✅ Increased coin reward: `opponentLevel * 3` → `opponentLevel * 5`. At Lv70: ~288 coins/win (was ~246).
  - ✅ Crafting recipes now use flat coin costs (200–120,000 per tier) instead of material-based pricing.
  - ✅ Removed deprecated material system entirely (materials arrays, materialPrices, normalizeMaterialItem, CONSUMABLE_CRAFT_COIN_FEES, buildMaterialInventory, ArenaMaterialReward type, material sprite mappings).
  - Skipped: daily login bonus, sell-to-vendor (larger features, deferred).

### P6 — Crit disabled on element advantage is counter-intuitive ✅
- **Problem:** In `calculateAttackOutcome`, crits are blocked when `elementMult > 1.0`. Players investing in crit gear get punished for having element advantage.
- **Fix:** Allow crits on super-effective hits at halved chance instead of blocking entirely:
  - `const reducedCritChance = critChance * 0.5; critical = randomFn() < reducedCritChance;`

### P7 — Element effectiveness is too swingy (1.5× / 0.5×) ✅
- **Problem:** A disadvantaged player deals half damage AND takes 1.5× — effectively a 3× power swing. Only 3 counter-pairs among 6 elements means hard-counters feel random.
- **Fix:** Soften to 1.3× / 0.7×. Or add neutral 0.85× for non-countered pairs so element matching always matters.
- **Also:** Let defender's `effectHit` reduce incoming elemental damage (symmetric with attacker's `effectHit` boosting it).

### P8 — Consumable durations are inconsistent ✅
- **Problem:** Damage/Speed Boost = 200 fights. Guard/Crit Boost = 1,500 fights. Same crafting effort, wildly different value.
- **Fix:** Normalize all boost consumables to 500 fights (or all to 1,000). Pick one and apply uniformly.

### P9 — Rarity power bonus doesn't scale with level ✅
- **Problem:** UR +18 vs C +0 is huge at level 1 but negligible at level 70 (power ~150).
- **Fix:** Scale rarity bonus: `rarityPower * (1 + level * 0.02)`. At level 70, UR gives +43 instead of +18.

### P10 — Win streak XP cap is too low ✅
- **Problem:** `min(streak, 10)` means streaks past 10 give no extra benefit.
- **Fix:** Logarithmic bonus: `floor(log2(streak + 1)) * 3`. Streak of 31 → +15 XP instead of +10.

### P11 — Equipment sub-stat `dmgPct` range is too wide ✅
- **Problem:** `dmgPct` range is 5–45% per sub-stat with 4 sub-stats per piece. A single piece could roll +180% damage.
- **Fix:** Reduce range to 5–20% or add a per-stat cap.

### P12 — Tutorial coin bonus rushes progression ✅
- **Problem:** 10,000 coins at level 5 is a huge one-time injection.
- **Fix:** Spread it: 2,000 at levels 5, 8, 12, 16, 20 (same total, smoother feel).

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
