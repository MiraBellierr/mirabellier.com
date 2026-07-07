# Arena Combat Formulas

This document is the quick reference for Arena combat math and balance caps.

## Core Stats

Fighters use these combat stats:

- `hp`: base health before guard, speed, power, and equipment percentage bonuses.
- `power`: primary attack stat.
- `guard`: primary defense stat and a smaller health contributor.
- `speed`: action ordering, evasion, and some passive scaling.
- `effectHit`: element scaling and shield pierce.

## Max HP

`computeMaxHp(stats, hpPct)`:

```txt
base = hp + guard * 1.0 + (power + speed) * 0.8
maxHp = floor(base * (1 + hpPct / 100))
```

`hpPct` comes from equipment percentage stats. Profile displays should include it when showing total HP.

## Action Order

Each turn pair checks who acts first:

```txt
playerScore = playerSpeed + randomInt(0, 4)
opponentScore = opponentSpeed + randomInt(0, 4)
player acts first when playerScore >= opponentScore
```

The fight ends when a combatant reaches 0 HP or when 60 attacks have been recorded.

## Evasion

`computeEvasionChance(attackerStats, defenderStats, extraDefenderEvasionPct)`:

```txt
speedGap = defenderSpeed - attackerSpeed
chance = 0.03 + speedGap * 0.00159 + extraDefenderEvasionPct / 100
chance is clamped to 0.02 through 0.44
```

Consumable and passive evasion are passed as `extraDefenderEvasionPct`. The live combat cap is 44%, even if an active effect stores a larger raw value.

## Attack Damage

`calculateAttackOutcome` first checks evasion. If the defender evades, damage is 0.

For landed attacks:

```txt
rarityPower = rarity.powerBonus * (1 + attackerLevel * 0.02)
attackRoll = power * 1.8 + speed * 0.7 + rarityPower + randomInt(-6, 12)
defenseRoll = guard * 1.6 + speed * 0.35 + defenderRarityPower + randomInt(-4, 8)

damage = max(1, floor(attackRoll - defenseRoll * 0.55))
damage += attackerDamageFlat
damageBase = max(1, damage)
damage = floor(damage * (1 + attackerDamagePct / 100))
```

Critical chance:

```txt
critChance = clamp(0.05 + bonusCritChancePct / 100, 0.05, 0.95)
```

Super-effective element hits can still crit, but their crit chance is halved. A crit multiplies damage by `baseCritMultiplier`, which is usually `1 + equipmentCritDmgPct / 100`.

Defense reductions then apply:

```txt
damage = floor(damage / (1 + defenderDamageReductionPct / 100))
damage -= defenderDamageReductionFlat
damage = max(1, damage)
```

True damage is tracked separately and added after the main combined multiplier cap.

## Element Multiplier

Element matchup starts from `ELEMENT_EFFECTIVENESS[attackerElement][defenderElement]`.

When the base multiplier is greater than 1:

```txt
effective = base + attackerEffectHit * 0.02 - defenderEffectHit * 0.01
effective is capped at 1.8
```

Defensive passives can reduce element effectiveness before the cap is applied.

`effectHit` also pierces shields:

```txt
shieldPiercePct = floor(effectHit / 10)
```

## Passive Timing

Passives run at these triggers:

- `onFightStart`: before attacks begin. Used for shields and startup effects.
- `onAttack`: before attack damage is calculated. Used for flat damage, damage percent, crit chance, and speed scaling.
- `onDamageTaken`: after a landed attack is known, before final HP loss. Used for reductions, temp guard, heals, reflect, counters, critical cancel, and element mitigation.
- `onDamageDealt`: after reductions are known, before the combined damage cap. Used for extra strikes and post-hit damage scaling.

Each passive action can define `chancePct` and `maxTriggersPerFight`. `doublePassiveTrigger` doubles passive chance, clamped to 100%.

## Combined Damage Cap

After element, criticals, attack percent, first-attack doubling, passives, and reductions:

```txt
finalDamage <= floor(damageBase * MAX_COMBINED_DAMAGE_MULTIPLIER)
```

`MAX_COMBINED_DAMAGE_MULTIPLIER` is 5. True damage is added after this cap because it is a separate fixed-damage mechanic.

## Shields

Shields absorb final damage before HP loss. Shield pierce from `effectHit` is applied first:

```txt
pierced = floor(finalDamage * shieldPiercePct / 100)
shieldDamage = finalDamage - pierced
shield absorbs shieldDamage
hp takes pierced plus any unabsorbed damage
```

## Revives

Phoenix Feather (`deathSave`) takes priority when both revive effects are available:

1. If HP reaches 0 and `deathSaveCharges > 0`, the defender survives at 1 HP.
2. If HP is still 0 and `selfReviveCharges > 0`, Chrono Vial restores:

```txt
reviveHp = ceil(maxHp * selfReviveHpThresholdPct / 100)
```

Chrono Vial is a KO revive, not a mid-fight heal at threshold.

## Rewards

Win XP:

```txt
10 + floor(opponentLevel * 2.5) + roundsWon * 2 + streakXpBonus
```

Streak XP bonus:

```txt
floor(min(log2(winStreak + 1), log2(6)) * 3)
```

Loss XP:

```txt
max(1, floor(winXp * 0.35))
```

Win coins:

```txt
base = 18 + opponentLevel * 5 + rarityCoinReward
coins = floor(base * (1 + min(winStreak * 0.02, 0.30)))
```

At level 70, overflow XP is converted to coins at `1 XP = 1 coin`, then XP is reset to 0.

## ELO

ELO uses the standard expected-score formula:

```txt
expectedWinner = 1 / (1 + 10 ^ ((loserRating - winnerRating) / 400))
delta = round(kFactor * (1 - expectedWinner))
```

Provisional fighters use `K = 48`. Established fighters use `K = 24`. Ratings are floored by the configured minimum.

## 60-Turn Timeout

When both fighters survive the 60-turn cap, the winner is chosen by remaining HP percentage:

```txt
playerPercent = playerHp / maxPlayerHp
opponentPercent = opponentHp / maxOpponentHp
```

The higher percentage wins. If percentages tie, normal round tiebreaking uses power, then speed, then a coin flip.

## NPC Scaling

NPCs use templates with base rarity, IV range, stat scale, and synthetic progression bonuses. Their snapshots include:

- base stats scaled by template and level
- synthetic equipment flat stats
- synthetic equipment percentage stats
- synthetic skill stats
- active passive list when the template has one

This keeps high-level NPCs closer to real players who have gear and skill-tree progression.

## Consumable Stacking Rules

Consumables have two stacking layers:

- Same effect type: activating the same consumable type extends charges or fight duration while the stored effect value stays fixed.
- Different effect types: effects can stack together, but only up to the active consumable slot limit and the combat caps above.

Current active consumable rules:

- A player can have up to 4 active consumable effect types.
- When activating a fifth effect, the player must choose which active effect to replace.
- Inventory quantity is capped per item type.
- Boost durations decrement per fight, not only on wins.

Damage-related consumables are still constrained by `MAX_COMBINED_DAMAGE_MULTIPLIER`. Evasion is constrained by the 44% live evasion cap. Revive effects are one-use KO saves according to the priority rules above.

## Runtime Balance Monitoring

The admin metrics endpoint reports these threshold alerts:

- Damage turns above 1000.
- Active evasion effect values above 50%.
- Win streaks above 100.

These alerts are monitoring signals for balance review. They do not automatically nerf or block a fight.
