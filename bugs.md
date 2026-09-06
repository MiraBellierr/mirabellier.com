# Arena — audit findings

Review of the Arena subsystem (frontend `src/pages/Arena*.tsx`, `src/parts/Arena*.tsx`,
`src/lib/arena/**`; backend `mirabellier-backend/lib/arena/**`, `routes/arena/**`,
`lib/arena-*.js`).

Baseline at time of review: all 154 backend arena tests pass and `eslint` is clean on the
arena frontend. Nothing below is caught by the existing checks.

---

## Bugs

### 1. Coin minting via `/arena/shop/fodder` — CRITICAL

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

### 2. `draw-pack` reports cards it never granted — HIGH

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

### 3. Turnstile verification is decorative for fights — HIGH

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

### 4. Same action, two different payouts — MEDIUM

Scrapping gear hits one endpoint but pays out differently depending on the originating screen:

| Screen | Call | Payout |
| --- | --- | --- |
| Inventory | `src/pages/ArenaInventory.tsx:586` — `fodderArenaPiece(token, piece.id)` | flat `500` (server default) |
| Shop reward modal | `src/pages/ArenaShop.tsx:271` — `onFodder(pieceId, Math.floor(price / 2))` | `price / 2` |

The Inventory confirm dialog hardcodes "500 coins" at `ArenaInventory.tsx:577`.

Resolving finding #1 (server-side refund) fixes this at the same time.

---

### 5. No request cancellation anywhere in Arena — MEDIUM

There is not a single `AbortController` across the 15 Arena pages.

Sharpest case — `src/pages/ArenaMarket.tsx:124-139`: `loadMarket` has no cancellation guard
and is driven from two places concurrently:

- the debounced filter effect (`:173-183`)
- the `arena:market:changed` websocket handler (`:185-190`)

A slow response for stale filters overwrites fresh results, and a stale `finally` clears
`marketLoading` while a newer request is still in flight.

---

### 6. Playback endpoints are unthrottled — LOW

`mirabellier-backend/lib/arena-fight-guard.js` is applied to `/fight` and `/fight/start`
only. `/fight/advance` and `/fight/skip` — both of which call
`finalizePlaybackFightRewards` — have no rate limit.

Separately, `pruneAttempts` walks every key in the attempts map on every fight request.

---

## Misalignment / dead config

### 7. Tier unlock levels are inert

`mirabellier-backend/lib/arena-constants.js` assigns each tier an `unlockLevel`
(1 / 8 / 16 / 28 / 42 / 58 at `L119-279`), but:

- `normalizeConsumableItem` hardcodes `unlockLevel: 1` (`L329`)
- `buildRecipes` hardcodes `unlockLevel: 1` (`L351`)
- `TIER_UNLOCK_LEVELS` (`L320`) is computed, exported (`L479`), and used **nowhere** in either tree

The test suite asserts *"consumable recipes are not level locked"*, so the behavior is
intentional — which makes those six per-tier numbers misleading dead data.

**Fix:** delete the per-tier `unlockLevel` values and `TIER_UNLOCK_LEVELS`, or wire them up.

---

### 8. `recipe.inputs` is always empty

`arena-constants.js:354` emits `inputs: []` for every recipe and `craftShopRecipe`
(`lib/arena/shop.js:659-709`) never reads it. Residue from the removed materials system
(see `mirabellier-backend/scripts/remove-arena-materials.cjs`).

---

### 9. `CRAFT_COIN_COSTS` is positionally coupled to `TIER_CONFIG`

`arena-constants.js:342`. Six costs, six tiers today. Adding a seventh tier silently yields
`coinCost: undefined` → `toInt(..., 0)` → **free crafting**, with no error.

**Fix:** key the costs by tier name, or assert the lengths match at module load.

---

### 10. Duplicate route mount

`mirabellier-backend/routes/arena/index.js:1085-1086`

```js
app.use("/arena", router);
app.use("/ar", router);
```

The frontend calls `/ar` zero times. Dead alias doubling the public API surface.

---

### 11. Raw SQL in the route layer

`mirabellier-backend/routes/arena/index.js:816-847` — `/trade/request/:requestId` is the only
handler running its own DB query; every other route delegates to `lib/`. Belongs in
`lib/arena/trade.js`.

---

## Duplication

### 12. 76 hand-rolled fetch blocks in `src/lib/arena/*.ts`

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

### 13. `normalizeArenaError` copy-pasted into 11 pages

Arena, ArenaArchive, ArenaCollection, ArenaFight, ArenaHallOfFame, ArenaInbox,
ArenaLeaderboard, ArenaMarket, ArenaMint, ArenaSkillTree, ArenaTrade.

Already drifted into three fallback strings:

- `"Arena request failed."`
- `"Arena market request failed."` (ArenaMarket)
- `"Arena trade request failed."` (ArenaTrade)

---

### 14. Shared game constants copied per-file

| Constant | Copies | Locations |
| --- | --- | --- |
| `ELEMENT_COLORS` | 6 (byte-identical) | ArenaCollection, ArenaFight, ArenaMarket, ArenaTrade, ArenaTradeSession, `arena-constants.js:40` |
| `ELEMENTS` | 5 | ArenaCollection, ArenaMint, ArenaTrade, ArenaTradeSession, `arena-constants.js:38` |
| `RARITIES` / `RARITY_ORDER` | 5 | ArenaMarket, ArenaMint, ArenaTrade, ArenaTradeSession, `arena-constants.js:1` |

Additionally, `src/pages/ArenaFight.tsx:44-51` re-encodes the `ELEMENT_EFFECTIVENESS` matrix
(`arena-constants.js:49-56`) by hand as `WEAKNESS_ROWS`. They agree today only by discipline —
a balance change to the matrix will not propagate.

---

### 15. Equipment / stat label tables duplicated

| Symbol | Files |
| --- | --- |
| `EQUIPMENT_SLOT_NAMES`, `EQUIPMENT_MAIN_NAMES`, `EQUIPMENT_SUB_NAMES`, `equipmentDisplayName` | `Arena.tsx`, `ArenaInventory.tsx` |
| `statLabel` | `ArenaInventory.tsx`, `ArenaCompensationPopup.tsx` |
| `hasCardItem`, `isMaxIvCard` | `ArenaInventory.tsx`, `ArenaShop.tsx` |

---

### 16. Committed one-off codemods

`tools/` holds five arena migration scripts, all targeting `src/lib/arena-api.ts` — a file
that no longer exists:

- `split-arena-frontend.cjs` and `split-arena-frontend.mjs` — the same script ported to both
  module systems (155 vs 144 lines, 39 differing)
- `split-arena-frontend-fix.cjs`
- `split-arena-legacy.cjs`
- `create-arena-modules.cjs`
- `fix-arena-modules.cjs`

---

## Adjacent (outside Arena, inherited by it)

`mirabellier-backend/app.js:165` — `bodyParser.json({ limit: "1gb" })` applies to every Arena
POST.

---

## Suggested order

1. #1 — coin minting (security, small contained fix)
2. #2 — draw-pack response (player-facing, one-word fix)
3. #4 — falls out of #1
4. #3 — Turnstile enforcement (needs a design decision on where to persist state)
5. #7, #8, #9, #10, #16 — dead code removal, low risk
6. #12, #13, #14, #15 — consolidation
