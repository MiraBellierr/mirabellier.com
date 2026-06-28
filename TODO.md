# TODO

## Critical bugs

- Fix backend Arena test suite failures. Current run: `npm test` in `mirabellier-backend` = 50 pass / 39 fail.
  - Update `test/arena-service.test.js#createTestDb` so the in-memory schema matches production schema in `lib/db.js`.
  - Add missing `arena_equipment_loadouts` table to the test DB.
  - Stop defaulting test profiles to `catalogVersion: "v2"` when current `CATALOG_VERSION` is `"v3"`, or make tests explicitly opt into migration cases.
  - Prefer a shared schema/bootstrap helper for tests so production schema and test schema cannot drift again.
- Fix ELO opponent selection regression. Test "ELO matchmaking prefers nearby ratings and avoids recent opponents" expects `u3` but gets `u2`, so recent-opponent avoidance or rating-distance ordering is wrong.
- Fix playback fight reward persistence. Test "playback fight state keeps finalized exp and coin rewards" fails after finalization, so finalized rewards are not being exposed or retained consistently.
- Remove `[HIGHER_RARITY_BONUS]` debug `console.log` calls from `mirabellier-backend/lib/arena/legacy-service.js`; they pollute test output and production logs.

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
