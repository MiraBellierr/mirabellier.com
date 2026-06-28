# Changes — 2026-06-28

*Frontend-only update (no backend changes)*

1. **Added HTTP fallback for Arena Fight turns** — your fights won't get stuck mid-battle if the socket disconnects; turns keep advancing automatically over HTTP instead.

2. **Added drag-and-drop material swapping in Arena Mint** — when forging a rainbow card you can drag or tap to swap which card is the "base" vs "material," which changes the resulting card's stats. Works on desktop (HTML5 drag) and mobile (touch-drag with floating ghost).

3. **Added card sacrifice in Arena Collection** — a new "sacrifice" toggle lets you select unwanted cards and exchange them for coins, with a coin preview and confirmation before committing.

4. **Added mobile drag ghost in TCG** — dragging cards on your phone now shows a floating visual following your finger, so you can see what you're dragging (attacks, element assigns, promotions, and card moves).

5. **Added auto-refresh for TCG game state** — the match board refreshes itself in the background and auto-cleans up finished games, so you're less likely to get stuck on a stale board.

6. **Fixed TCG element display on cards** — card thumbnails now show up to 2 element icons instead of 1, so you can tell at a glance how many elements are assigned.

7. **Fixed mobile touch-drag scrolling interference in Arena Mint** — long-pressing a material card now properly blocks page scroll so the drag feels smooth and you can actually drop on the other slot.

8. **Fixed mobile card grid overflow in Mint, Collection, and Trade modals** — card listings now fit properly on small phone screens (320–380px). Cards shrink slightly and padding is reduced on narrow screens so two-column grids stop overflowing.
