# Arena — audit findings

Review of the Arena subsystem (frontend `src/pages/Arena*.tsx`, `src/parts/Arena*.tsx`,
`src/lib/arena/**`; backend `mirabellier-backend/lib/arena/**`, `routes/arena/**`,
`lib/arena-*.js`).

Baseline at time of review: all 154 backend arena tests pass and `eslint` is clean on the
arena frontend. Nothing below is caught by the existing checks.

---

## Bugs

### 1. Coin minting via `/arena/shop/fodder` — CRITICAL — ✅ FIXED

**Resolution:** `fodderEquipmentPiece` no longer accepts `refundAmount`; the payout is
derived server-side by `getFodderRefund(slot)` (half the slot's `ROLLABLE_EQUIPMENT` price,
fallback 500). The route stopped parsing `req.body.refundAmount`, and the frontend
(`fodderArenaPiece` + call sites) no longer sends it. Also resolves #4 — both scrap paths
now pay the same server-derived amount. All 211 backend tests pass.

**Where:** `mirabellier-backend/lib/arena/equipment.js:291`, reached from
`mirabellier-backend/routes/arena/index.js:561`

```js
const FODDER_PRICE = typeof refundAmount === "number" && refundAmount > 0 ? refundAmount : 500;
```

`refundAmount` is taken straight from the request body and used verbatim as the coin credit.
Any authenticated user can POST `{ pieceId, refundAmount: 1000000000 }` and mint arbitrary
currency.

**Contrast:** `lib/arena/market.js:202-213` validates `price` server-side against
`MARKET_MIN_PRICE` / `MARKET_MAX_PRICE` before trusting it. That is the pattern this endpoint
is missing.

**Fix:** derive the refund server-side from the piece's slot / tier / enhancement level and
ignore the body field entirely.

---

### 2. `draw-pack` reports cards it never granted — HIGH — ✅ FIXED

**Resolution:** `pulled` is now hoisted out of the transaction and the response
(`cardsWithOwned`) maps over it instead of `drawnCards`, so only inserted cards are
returned. Added regression test *"draw-pack only reports the cards it actually granted
near the daily limit"* (`test/arena-service.test.js`). 212 backend tests pass.

**Where:** `mirabellier-backend/lib/arena/card-shop.js:81-114`

The transaction inserts `pulled` (the slice truncated to the remaining daily draw allowance),
but the response maps over `drawnCards` — the full requested count:

```js
const pulled = drawnCards.slice(0, actualCount);   // inserted
...
const cardsWithOwned = drawnCards.map(...)          // returned
```

With 2 draws remaining and a 5-card request, 2 cards are saved but 5 render in the
pack-opening modal.

**Fix:** build the response from `pulled`.

---

### 3. Turnstile verification is decorative for fights — HIGH — ✅ FIXED

**Resolution:** Added `mirabellier-backend/lib/arena-fight-verification.js` — an
in-memory store (same trade-off as `arena-fight-guard.js`: dropped on restart, not
shared across instances) keyed by user id with a 30-minute sliding expiry.
`POST /arena/verify` now requires auth and calls `markArenaFightVerified(user.id)` after
the Turnstile check passes. Both fight transports enforce it:
`requireArenaFightVerified` gates `/fight`, `/fight/start`, `/fight/advance`,
`/fight/skip` in `routes/arena/index.js`, and `app.js`'s WebSocket `handleMessage`
rejects `arena:fight:{start,advance,skip}` from unverified users with
`ARENA_VERIFICATION_REQUIRED`. Frontend (`ArenaFight.tsx`) drops back to the widget on
that code; the `arena-fight-resume.ts` doc comment now points at the server gate.
Tests: `test/arena-fight-verification.test.js` (7 unit) + a route integration test in
`arena-service.test.js`. 220 backend tests pass.

**Where:** `mirabellier-backend/routes/arena/index.js:117-125`

`/arena/verify` validates the token and returns `{ ok: true }` without recording anything
server-side. None of `/fight`, `/fight/start`, `/fight/advance`, `/fight/skip` check
verification state. The gate exists only as React state (`src/pages/ArenaFight.tsx:285-291`),
so calling the API directly bypasses it completely.

Compounding this: `src/lib/arena-fight-resume.ts:58-61` documents the invariant as though it
were enforced server-side, which makes the gap easy to miss on a read-through.

**Fix:** persist verification against the session/user with an expiry and require it in the
fight handlers.

---

### 4. Same action, two different payouts — MEDIUM — ✅ FIXED

**Resolution:** #1 already made the payout server-authoritative (`getFodderRefund(slot)`,
body field ignored), so both screens now credit the same amount. This change also removes
the client-side display drift: `getFodderRefund` is exported and surfaced as
`fodderRefund` on every serialized piece (`toPublicEquipmentPiece`) and on the shop buy
response's `rolledPiece`. `ArenaInventory.tsx` and `ArenaShop.tsx`'s reward modal now show
`piece.fodderRefund` verbatim instead of a hardcoded `500` / `Math.floor(price / 2)`.
Regression test: *"scrap payout is server-derived and identical for every screen"*.
221 backend tests pass.

Scrapping gear hits one endpoint but pays out differently depending on the originating screen:

| Screen | Call | Payout |
| --- | --- | --- |
| Inventory | `src/pages/ArenaInventory.tsx:586` — `fodderArenaPiece(token, piece.id)` | flat `500` (server default) |
| Shop reward modal | `src/pages/ArenaShop.tsx:271` — `onFodder(pieceId, Math.floor(price / 2))` | `price / 2` |

The Inventory confirm dialog hardcodes "500 coins" at `ArenaInventory.tsx:577`.

Resolving finding #1 (server-side refund) fixes this at the same time.

---

### 5. No request cancellation anywhere in Arena — MEDIUM — ✅ FIXED

**Resolution (sharpest case):** `fetchArenaMarketListings` now accepts an `AbortSignal`.
`ArenaMarket.tsx`'s `loadMarket` aborts the previous in-flight request, tags each run with
an id, and only applies `setMarket` / `setErrorMessage` / `setMarketLoading(false)` when
its run is still current and unaborted — a slow stale response can no longer overwrite
fresh results or flip the loading flag mid-flight. Debounced effect now depends on
`loadMarket` (no more `exhaustive-deps` disable); unmount aborts.

**Resolution (follow-up):** extracted the pattern into `src/hooks/use-abortable-request.ts`
(`run(fetcher, { onResult, onError, onSettled })` — aborts prior request, drops
stale/aborted runs, aborts on unmount) and applied it to every other Arena loader that
was refetched from multiple uncoordinated triggers:

- `ArenaMarket.tsx` — `loadMarket` + `loadOwnedData` (migrated to the hook)
- `ArenaTrade.tsx` — `loadListings` + the mine/collection bundle; kills the
  `loadData` / `loadListings` / `refreshAfterMutation` (+ `arena:trade:listing-changed`
  websocket) overlap
- `ArenaInbox.tsx` — `loadData`, hit by pagination and two notification websockets
- `ArenaShop.tsx` — `loadCardOffers` (effect + manual refresh button)

`AbortSignal` params added to `fetchArenaTradeListings`, `fetchMyArenaTradeListings`,
`fetchArenaNotifications`, `fetchArenaCollection`, `fetchMyArenaMarketListings`,
`fetchArenaCardShop`.

The remaining Arena pages (Collection, Leaderboard, HallOfFame, Archive, Mint, Inventory,
Arena, SkillTree) already prevent stale-state application with `let cancelled` guards on
their single re-fetch effect and aren't websocket-driven, so they have no
stale-overwrite bug — only the network request itself isn't aborted (efficiency, not
correctness). `tsc`, `eslint .`, `npm test`, and `npm run build` all clean.

Sharpest case — `src/pages/ArenaMarket.tsx:124-139`: `loadMarket` has no cancellation guard
and is driven from two places concurrently:

- the debounced filter effect (`:173-183`)
- the `arena:market:changed` websocket handler (`:185-190`)

A slow response for stale filters overwrites fresh results, and a stale `finally` clears
`marketLoading` while a newer request is still in flight.

---

### 6. Playback endpoints are unthrottled — LOW — ✅ FIXED

**Resolution:** `arena-fight-guard.js` refactored into a generic `checkRateLimit(prefix,
windows, req, userId, now)` with two keyed limiters:

- `checkArenaFightRateLimit` — fight creation, 30/min per account + per IP (unchanged).
- `checkArenaPlaybackRateLimit` — playback stepping, 600/min per account + per IP. Well
  above any legitimate cadence (fastest playback speed is ~2.5 steps/s), low enough to
  stop a script hammering the reward-finalizing path.

`/fight/advance` and `/fight/skip` now call the playback limiter (HTTP routes), and the
`app.js` WebSocket handler applies the fight limiter to `arena:fight:start` and the
playback limiter to `arena:fight:advance` / `arena:fight:skip` (passing `req = null` →
account-scope only). Over-limit → `429` / `ARENA_FIGHT_ERROR` with code
`ARENA_FIGHT_RATE_LIMIT` and `retryAfterMs`.

`pruneAttempts` no longer runs on every request — it's a memory-reclaim sweep for idle
keys, so it now runs at most once per 30s (`PRUNE_INTERVAL_MS`); per-key expiry was
already handled in `checkWindow`. Tests added in `test/arena-fight-guard.test.js`
(playback ceiling, independent buckets, `req = null` path). 224 backend tests pass.

---

## Misalignment / dead config

### 7. Tier unlock levels are inert — ✅ FIXED

**Resolution:** deleted the dead data — removed the per-tier `unlockLevel` values
(1 / 8 / 16 / 28 / 42 / 58) from `TIER_CONFIG`, the derived `TIER_UNLOCK_LEVELS` map, and
its export. Nothing read any of it (confirmed by grep across backend + frontend). The
real, always-open gate — `unlockLevel: 1` on the normalized consumable items and recipes,
checked by `shop.js` — is untouched; added a comment there so it isn't "fixed" back into
a tier lock. New test *"every tier's consumables and recipes are unlocked at level 1"*
locks the intent. 225 backend tests pass.

`mirabellier-backend/lib/arena-constants.js` assigns each tier an `unlockLevel`
(1 / 8 / 16 / 28 / 42 / 58 at `L119-279`), but:

- `normalizeConsumableItem` hardcodes `unlockLevel: 1` (`L329`)
- `buildRecipes` hardcodes `unlockLevel: 1` (`L351`)
- `TIER_UNLOCK_LEVELS` (`L320`) is computed, exported (`L479`), and used **nowhere** in either tree

The test suite asserts *"consumable recipes are not level locked"*, so the behavior is
intentional — which makes those six per-tier numbers misleading dead data.

**Fix:** delete the per-tier `unlockLevel` values and `TIER_UNLOCK_LEVELS`, or wire them up.

---

### 8. `recipe.inputs` is always empty — ✅ FIXED

**Resolution:** removed the field and every dead consumer:
- `arena-constants.js` — dropped `inputs: []` from `buildRecipes`.
- `lib/arena/shop.js` — `buildShopCatalog` no longer computes `hasInputs`; `getArenaShopPayload`
  drops the `inputState` map and stops emitting `inputs` on each recipe. `canCraft` is now
  `unlocked && hasCoins && underInventoryCap` (the `hasInputs` term was always `true`).
- `src/lib/arena/shared.ts` — removed `inputs` from `ArenaShopRecipe`.
- `src/pages/ArenaShop.tsx` — removed the always-empty `recipe.inputs` render branch.

`craftShopRecipe` never referenced it. 225 backend + 25 frontend tests pass; `tsc`,
`eslint`, and `npm run build` clean.

`arena-constants.js:354` emits `inputs: []` for every recipe and `craftShopRecipe`
(`lib/arena/shop.js:659-709`) never reads it. Residue from the removed materials system
(see `mirabellier-backend/scripts/remove-arena-materials.cjs`).

---

### 9. `CRAFT_COIN_COSTS` is positionally coupled to `TIER_CONFIG` — ✅ FIXED

**Resolution:** `CRAFT_COIN_COSTS` is now an object keyed by tier name
(`{ Rookie: 200, Bronze: 800, Silver: 3200, Gold: 10000, Mythic: 36000, Cosmic: 120000 }`),
hoisted to module scope. `buildRecipes` looks up the cost by `tierConfig.tier` and throws
`missing CRAFT_COIN_COSTS entry for tier "<name>"` at module load if one is absent — so a
new tier fails loudly on startup/tests instead of silently crafting for free. New test
*"every craft recipe has a positive per-tier coin cost"*. 226 backend tests pass.

`arena-constants.js:342`. Six costs, six tiers today. Adding a seventh tier silently yields
`coinCost: undefined` → `toInt(..., 0)` → **free crafting**, with no error.

**Fix:** key the costs by tier name, or assert the lengths match at module load.

---

### 10. Duplicate route mount — ✅ FIXED

**Resolution:** removed `app.use("/ar", router)` — only `app.use("/arena", router)` remains.
Confirmed no frontend API call targets `/ar/*` (every `joinApi` path is `/arena/...`); the
`/ar/*` entries in `src/App.tsx` are client-side React Router short-URLs for pages and never
hit this mount. Updated the route-registration test: dropped its `/ar/archive` check (now
covered by `/arena/hall-of-fame`) and added an assertion that `/ar/archive` returns 404.
226 backend tests pass.

`mirabellier-backend/routes/arena/index.js:1085-1086`

```js
app.use("/arena", router);
app.use("/ar", router);
```

The frontend calls `/ar` zero times. Dead alias doubling the public API surface.

---

### 11. Raw SQL in the route layer — ✅ FIXED

**Resolution:** moved the query into `getTradeRequestForUser(db, userId, requestId)` in
`lib/arena/trade.js` (placed next to `getIncomingTradeRequests`, exported, and re-exported
via the `lib/arena` barrel). The `/trade/request/:requestId` handler is now a one-liner
delegating to it, like every other route. `grep` confirms no `db.prepare` / `.transaction(`
remains in `routes/arena/index.js`. New test
*"getTradeRequestForUser returns the request to either party and 404s strangers"*.
227 backend tests pass.

`mirabellier-backend/routes/arena/index.js:816-847` — `/trade/request/:requestId` is the only
handler running its own DB query; every other route delegates to `lib/`. Belongs in
`lib/arena/trade.js`.

---

## Duplication

### 12. 76 hand-rolled fetch blocks in `src/lib/arena/*.ts` — ✅ FIXED

**Resolution:** added `arenaRequest<T>(path, { method?, token?, body?, query?, signal? })`
to `shared.ts` — one place that builds the URL + query string, sets
`credentials`/`cache`/bearer/JSON headers, throws a normalized `ArenaApiError` on non-2xx,
and returns the parsed body (`undefined` for an empty response). Every reader/mutator in
all 17 `src/lib/arena/*.ts` files (including `tcg.ts`, which hits `/tcg/*`) was rewritten
to call it; the only remaining raw `fetch(` in the directory is the one inside
`arenaRequest`. Caller files dropped from ~1440 to ~745 LOC (`shared.ts` +53 for the
wrapper). Response normalizers (`normalizeProfile`, `normalizeActiveFight`, …) stay in the
callers. `leaveTcgQueue` keeps its best-effort (never-throws) behavior via a local
try/catch. `tsc`, `eslint`, `npm run build`, and 25 frontend tests all pass.

Per-file count: trade 20, equipment 10, tcg 9, combat 6, market 6, collection 4,
notifications 4, shop 4, skill-tree 3, card-shop 2, cards 2, mint 2, updates 2, archive 1,
profile 1.

Each repeats the identical sequence:

```ts
const response = await fetch(joinApi(PATH), {
  method: "POST",
  credentials: "include",
  headers: makeAuthHeaders(token),
  body: JSON.stringify({ ... }),
});
if (!response.ok) throw await readApiError(response);
return (await response.json()) as T;
```

`shared.ts` exports `readApiError` and `makeAuthHeaders` but no request wrapper. A single
`arenaRequest<T>(token, path, body?)` would remove the bulk of that directory.

---

### 13. `normalizeArenaError` copy-pasted into 11 pages — ✅ FIXED

**Resolution:** one canonical `normalizeArenaError` now lives in `src/lib/arena/shared.ts`
(re-exported by the `@/lib/arena` barrel). It's the superset — includes the
`cooldownEndsAt` formatting that only `arena-shop-ui.tsx` had, so all pages now render the
"(Cooldown ends …)" suffix. Deleted all 11 page-local copies (and the 12th in
`arena-shop-ui.tsx`, which re-exports the shared one for its existing importers). The three
drifted fallback strings ("Arena market/trade/… request failed.") collapse to the single
`"Arena request failed."`. `tsc`, `eslint`, `npm run build`, and 25 frontend tests pass.

Arena, ArenaArchive, ArenaCollection, ArenaFight, ArenaHallOfFame, ArenaInbox,
ArenaLeaderboard, ArenaMarket, ArenaMint, ArenaSkillTree, ArenaTrade.

Already drifted into three fallback strings:

- `"Arena request failed."`
- `"Arena market request failed."` (ArenaMarket)
- `"Arena trade request failed."` (ArenaTrade)

---

### 14. Shared game constants copied per-file — ✅ FIXED

**Resolution:** new leaf module `src/lib/arena/constants.ts` (exported via the
`@/lib/arena` barrel) holds `ELEMENTS`, `RARITIES` / `RARITY_ORDER`, `ELEMENT_COLORS`,
plus `ELEMENT_BEATS` (element-matchup map mirroring the backend `ELEMENT_EFFECTIVENESS`)
and a `WEAKNESS_ROWS` **derived** from it. Deleted the per-file copies in ArenaCollection,
ArenaFight, ArenaMarket, ArenaTrade, ArenaMint, and `parts/ArenaTradeSession` — all now
import from the shared module. `ArenaFight`'s hand-transcribed `WEAKNESS_ROWS` is gone;
`ArenaMint`'s "" filter option is now `["", ...ELEMENTS]`. `src/lib/tcg-constants.ts` was
a 6th copy — it now re-exports the three shared values. Backend `arena-constants.js`
stays the gameplay source of truth (can't be imported cross-runtime), but the frontend
now has exactly one copy. `tsc`, `eslint`, `npm run build`, 25 frontend tests pass.

| Constant | Copies | Locations |
| --- | --- | --- |
| `ELEMENT_COLORS` | 6 (byte-identical) | ArenaCollection, ArenaFight, ArenaMarket, ArenaTrade, ArenaTradeSession, `arena-constants.js:40` |
| `ELEMENTS` | 5 | ArenaCollection, ArenaMint, ArenaTrade, ArenaTradeSession, `arena-constants.js:38` |
| `RARITIES` / `RARITY_ORDER` | 5 | ArenaMarket, ArenaMint, ArenaTrade, ArenaTradeSession, `arena-constants.js:1` |

Additionally, `src/pages/ArenaFight.tsx:44-51` re-encodes the `ELEMENT_EFFECTIVENESS` matrix
(`arena-constants.js:49-56`) by hand as `WEAKNESS_ROWS`. They agree today only by discipline —
a balance change to the matrix will not propagate.

---

### 15. Equipment / stat label tables duplicated — ✅ FIXED

**Resolution:** new module `src/lib/arena/equipment-display.ts` (exported via the
`@/lib/arena` barrel) holds `EQUIPMENT_SLOT_NAMES` / `EQUIPMENT_MAIN_NAMES` /
`EQUIPMENT_SUB_NAMES`, `MAIN_STAT_LABELS`, `statLabel`, `equipmentDisplayName`,
`isMaxIvCard`, `hasCardItem`. Deleted the copies in `Arena.tsx` (3 name tables +
`EQUIPMENT_MAIN_LABELS`, which was byte-identical to `MAIN_STAT_LABELS` + `equipmentDisplayName`),
`ArenaInventory.tsx` (all of the above + `statLabel` + `isMaxIvCard` + `hasCardItem`),
`ArenaShop.tsx` (`isMaxIvCard`, `hasCardItem`), and `parts/ArenaCompensationPopup.tsx`
(`statLabel`). `isMaxIvCard`/`hasCardItem` now take a structural `IvCard` type so both the
`ArenaCard` and `selectedCard` call sites work.

One intentional behavior delta: `ArenaInventory`'s reroll-modal `statLabel(...)` now
renders full labels ("Power", "Effect Hit") instead of the abbreviations ("P", "EH") it
inherited from reusing the sort-dropdown map; the sort dropdown itself (`SUB_STAT_LABELS`,
still local) is unchanged. `tsc`, `eslint`, `npm run build`, 25 frontend tests pass.

| Symbol | Files |
| --- | --- |
| `EQUIPMENT_SLOT_NAMES`, `EQUIPMENT_MAIN_NAMES`, `EQUIPMENT_SUB_NAMES`, `equipmentDisplayName` | `Arena.tsx`, `ArenaInventory.tsx` |
| `statLabel` | `ArenaInventory.tsx`, `ArenaCompensationPopup.tsx` |
| `hasCardItem`, `isMaxIvCard` | `ArenaInventory.tsx`, `ArenaShop.tsx` |

---

### 16. Committed one-off codemods — ✅ FIXED

**Resolution:** `git rm`'d all six dead arena migration scripts — `create-arena-modules.cjs`,
`fix-arena-modules.cjs`, `split-arena-frontend-fix.cjs`, `split-arena-frontend.cjs`,
`split-arena-frontend.mjs`, `split-arena-legacy.cjs`. They targeted `src/lib/arena-api.ts`
and `mirabellier-backend/lib/arena/legacy-service.js`, both long gone, and nothing (no
package.json script, CI, or source) referenced them. `tools/extract-game-sprites.cjs`
(unrelated sprite tool) is kept. `tsc` and `eslint .` still clean.

`tools/` holds five arena migration scripts, all targeting `src/lib/arena-api.ts` — a file
that no longer exists:

- `split-arena-frontend.cjs` and `split-arena-frontend.mjs` — the same script ported to both
  module systems (155 vs 144 lines, 39 differing)
- `split-arena-frontend-fix.cjs`
- `split-arena-legacy.cjs`
- `create-arena-modules.cjs`
- `fix-arena-modules.cjs`

---

## Adjacent (outside Arena, inherited by it) — ✅ FIXED

`mirabellier-backend/app.js:165` — `bodyParser.json({ limit: "1gb" })` applied to every Arena
POST (and every other POST in the app), letting any request force the server to buffer up
to 1GB in memory.

**Resolution:** dropped both the JSON and urlencoded global limits to `2mb`. Generous
headroom for the largest real payload (a rich-text blog post — its images are uploaded
separately as URLs via multer, which bypasses body-parser), with no DoS surface. A route
that ever needs more can mount its own `express.json({ limit })`. 227 backend tests pass.

---

## Suggested order

1. #1 — coin minting (security, small contained fix)
2. #2 — draw-pack response (player-facing, one-word fix)
3. #4 — falls out of #1
4. #3 — Turnstile enforcement (needs a design decision on where to persist state)
5. #7, #8, #9, #10, #16 — dead code removal, low risk
6. #12, #13, #14, #15 — consolidation
