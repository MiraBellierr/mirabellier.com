# Arena Consumables

## Acquisition

Consumables are a **plain coin purchase** — there is no recipe, and no material
input. `POST /arena/shop/buy` with `{ itemId, quantity }` charges `item.price`
(from `CONSUMABLE_TIER_PRICES` by tier, or a per-item `price` override such as
`solar_cauldron`) and drops the item straight into the inventory. `TIER_UNLOCK_LEVELS`
gates each tier by player level (Rookie 1 / Bronze 8 / Silver 16 / Gold 28 /
Mythic 42 / Cosmic 58), enforced in `buyShopItem`.

## Duration model

Combat consumables are **tactical windows, not permanent loadout slots**. One
purchase grants a short duration, set from a small number of named constants in
`lib/arena-constants.js` (the single source of truth):

| Constant | Value | Applies to |
|---|---|---|
| `ECONOMY_BOOST_FIGHT_DURATION` | 20 fights | exp / coin gain boosts |
| `OFFENSIVE_BOOST_FIGHT_DURATION` | 12 fights | damage, speed, crit, lifesteal, all-stat |
| `DEFENSIVE_BOOST_FIGHT_DURATION` | 8 fights | fight-start shields, evade, guard |
| `RARITY_BOOST_FIGHT_DURATION` | 3 fights | rarity-matchup and IV boosts |
| `ONE_SHOT_SAVE_CHARGES` | 2 charges | KO saves, first-strike gimmicks |

`EFFECT_DURATION_LIMITS` (`lib/arena/_constants.js`) caps how much duration can be
banked by re-buying — roughly three purchases' worth per field. Legacy profiles
carrying the old 250–1000 values are clamped down to these caps on next load.
Prices are tuned so one purchase costs a handful of wins once its window is
spent, making consumables a recurring coin sink rather than a one-time unlock.

Consumable effects use these stacking rules:

- Reusing the same effect type keeps the active value unchanged and only adds duration or charges.
- If the effect is not already active, the consumable sets its value from the item being used.
- Same-type values are still normalized by the server caps for saved or legacy data. For example, damage boost is capped at 200%, evade boost at 95%, vampiric heal at 100%, and fight-start shield at 9999.
- Different effect types stack through the combat formula. For example, stat steroid, damage boost, element advantage, critical damage, equipment damage, and passives can all contribute to one hit.
- Combat applies the global non-true-damage cap after those multipliers: final non-true damage cannot exceed `damageBase * MAX_COMBINED_DAMAGE_MULTIPLIER`.
- True damage is added after the multiplier cap. It is limited by its own consumable value cap.
- Only `MAX_ACTIVE_CONSUMABLE_EFFECTS` tracked consumable kinds can be active at once. Activating a new kind at the cap requires replacing an existing active kind.

Legacy effect fields still normalize for saved profiles, but only effects present in `TIER_CONFIG` are purchasable consumables.
