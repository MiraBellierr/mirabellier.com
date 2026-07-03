# Arena Consumables

Consumable effects use these stacking rules:

- Reusing the same effect type keeps the active value unchanged and only adds duration or charges.
- If the effect is not already active, the consumable sets its value from the item being used.
- Same-type values are still normalized by the server caps for saved or legacy data. For example, damage boost is capped at 200%, evade boost at 95%, vampiric heal at 100%, and fight-start shield at 9999.
- Different effect types stack through the combat formula. For example, stat steroid, damage boost, element advantage, critical damage, equipment damage, and passives can all contribute to one hit.
- Combat applies the global non-true-damage cap after those multipliers: final non-true damage cannot exceed `damageBase * MAX_COMBINED_DAMAGE_MULTIPLIER`.
- True damage is added after the multiplier cap. It is limited by its own consumable value cap.
- Only `MAX_ACTIVE_CONSUMABLE_EFFECTS` tracked consumable kinds can be active at once. Activating a new kind at the cap requires replacing an existing active kind.

Legacy effect fields still normalize for saved profiles, but only effects present in `TIER_CONFIG` are craftable consumables.
