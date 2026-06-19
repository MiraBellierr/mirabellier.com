# Todo List

## Arena audit

### Confirmed bugs

- [ ] Fix Riversteel Saber passive: critical chance is applied after the critical hit has already been calculated.
- [ ] Fix Verdant Core healing: it currently changes only a temporary context value instead of the fighter's actual HP.
- [ ] Fix Guard Cap duration: temporary guard currently stacks and remains active for the entire fight instead of one turn.
- [ ] Fix Twinlight Blades: its 12% extra-strike chance is rolled twice, making the effective chance about 1.44%.
- [ ] Fix Fuse Bomb true damage so it bypasses damage reduction and is not multiplied by critical hits.
- [ ] Make Fuse Bomb consume its charge only after a successful damaging hit, not when the attack is evaded.
- [ ] Make Lantern Oil consume its charge only when fighting an opponent with higher rarity and the bonus is actually applied.

### Visibility and tests

- [ ] Show card IV combat bonuses in the displayed Arena stat breakdown so players can verify that IVs are working.
- [ ] Update the stale backend test assertion from `attacked` to the current attack log wording.
- [ ] Add deterministic regression tests for every passive and consumable listed above.

### Verified working

- [x] Validate all 24 gear items, 18 consumables, 18 materials, and 42 recipes.
- [x] Verify equipment stats persist and carry into combat.
- [x] Verify equipped passives are loaded into combat.
- [x] Verify card IVs persist, remain within 0–31, and affect combat.
- [x] Verify consumable effects are recognized and stored.
- [x] Verify collection card selection preserves IVs and rarity.
- [x] Verify the frontend production build succeeds.
