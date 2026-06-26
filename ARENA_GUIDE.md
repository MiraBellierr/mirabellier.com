# 🏟️ Mirabellier Arena — Complete Guide

Welcome to the Arena! This is a deep, stats-driven card battling game where you collect anime character cards, equip them with gear, train them through combat, and climb the ELO ladder. This guide covers every mechanic, formula, and system in exhaustive detail.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Cards & Collection](#2-cards--collection)
3. [Combat System](#3-combat-system)
4. [Equipment](#4-equipment)
5. [Consumables](#5-consumables)
6. [Skill Tree](#6-skill-tree)
7. [Shop](#7-shop)
8. [Marketplace & Trading](#8-marketplace--trading)
9. [Experience & Leveling](#9-experience--leveling)
10. [ELO Rating System](#10-elo-rating-system)
11. [Rainbow Cards (Minting)](#11-rainbow-cards-minting)
12. [NPC Opponents](#12-npc-opponents)
13. [Fight Cooldowns & Guards](#13-fight-cooldowns--guards)
14. [Strategies & Tips](#14-strategies--tips)

---

## 1. Overview

The Arena is a **turn-based auto-battler** built around five core stats and a rock-paper-scissors element system. You build a fighter using:

- **A card** (anime character with rarity, element, and Individual Values)
- **Equipment** (weapon, armour, charm with random sub-stats)
- **Skill tree nodes** (permanent stat bonuses and passive abilities)
- **Active consumables** (temporary buffs and effects)

Battles are **fully simulated on the server** and can be replayed turn-by-turn in the browser. All randomness is server-authoritative.

### The Five Core Stats

| Stat | Abbreviation | Role |
|------|:---:|------|
| **HP** | — | Your life total. Reaches 0 = you lose |
| **Power** | P | Primary damage stat. Scales attack rolls at **1.8×** |
| **Guard** | G | Primary defense stat. Contributes **1.6×** to defense rolls, and **2.2×** to max HP |
| **Speed** | S | Turn order (higher acts first), evasion chance, and contributes **0.7×** to attack and **0.35×** to defense |
| **Effect Hit** | EH | Determines super-effective damage via `1.5 + EH × 0.02` (each point adds 0.02× on top of the 1.5× element matchup). Also dampens enemy element advantage through passives. |

---

## 2. Cards & Collection

### 2.1 Card Anatomy

Every card has:

- **`malId`** — the MyAnimeList character ID
- **Title** — character name + source anime
- **Rarity** — C, R, SR, SSR, or UR
- **Element** — Fire 🔥, Water 💧, Earth 🌿, Wind 🍃, Light ✨, or Dark 🌑
- **IVs** (Individual Values) — four numbers (0–31) in Power, Guard, Speed, Effect Hit
- **Rainbow flag** — `true` if the card was minted from duplicates

### 2.2 Rarity Distribution

Cards are assigned rarity based on the character's **popularity rank** in the MAL catalog (lower rank = more popular = higher rarity):

| Rarity | Weight | Rank Threshold | Card Frame |
|--------|:------:|:--------------:|-------------|
| **UR** (Ultra Rare) | 1% | Top 1% | Gold prismatic frame, 5 stars |
| **SSR** | 4% | Next 4% | Red/rose frame, 4 stars |
| **SR** | 10% | Next 10% | Purple frame, 3 stars |
| **R** (Rare) | 25% | Next 25% | Blue/silver frame, 2 stars |
| **C** (Common) | 60% | Remaining 60% | Brown frame, 1 star |

### 2.3 Rarity Combat Bonus

Rarity provides a flat bonus to both **attack and defense rolls** at `rarityPower × 0.2`:

| Rarity | Combat Bonus |
|--------|:-----------:|
| C | 0 |
| R | 3 |
| SR | 7 |
| SSR | 12 |
| UR | 18 |

### 2.4 IVs (Individual Values)

Each card has 4 randomly generated IVs between **0 and 31**. The **IV total** is the sum (range: 0–124). These IVs translate to actual stat bonuses when the card is selected:

| IV Stat | Conversion to Bonus |
|---------|---------------------|
| Power IV | `floor(powerIV / 3)` → Power stat |
| Guard IV | `floor(guardIV / 3)` → Guard stat **AND** `floor(guardIV / 2)` → HP |
| Speed IV | `floor(speedIV / 3)` → Speed stat |
| Effect Hit IV | `floor(effectHitIV / 3)` → Effect Hit stat |

> **Example:** A card with 31/31/31/31 IVs (total 124, "perfect") gives: +10 Power, +10 Guard, +15 HP, +10 Speed, +10 Effect Hit.

### 2.5 Metadata Bonuses

Cards also get bonus "power" for matchmaking purposes based on their MAL score and popularity:

```
malScoreBonus  = clamp((meanScore - 6) × 4, 0, 16)
popularityBonus = clamp((2500 - popularityRank) / 250, 0, 10)
```

- Mean score of 10 → +16 bonus
- Rank #1 in popularity → +10 bonus

### 2.6 Daily Card Draws

- **10 draws per day** (resets at midnight UTC)
- Each draw gives one random card from the full catalog
- A **pack** is 5 cards drawn together
- You can see remaining draws on the Arena home page

---

## 3. Combat System

### 3.1 Element Effectiveness

The six elements form two independent triangles:

```
      🔥 Fire ──beats──→ 🌿 Earth
       ↑                    ↓
       │                    │
      💧 Water ←──beats─── ┘

      🍃 Wind ──beats──→ ✨ Light
       ↑                    ↓
       │                    │
      🌑 Dark ←──beats─── ┘
```

| Scenario | Multiplier |
|----------|:----------:|
| Super-effective (strong vs enemy) | `1.5 + (Effect Hit × 0.02)` — scales from the 1.5× element matchup |
| Neutral (different triangles) | **1.0×** |
| Not very effective (weak vs enemy) | **0.5×** |

> **Super-effective example:** You have 10 Effect Hit → multiplier is `1.5 + 10 × 0.02 = 1.70×` damage.
> Some passives/items can dampen element effectiveness (minimum dampened: 1.5×).

**⚠️ Critical hits are DISABLED when you have super-effective element advantage.** This prevents double-dipping.

### 3.2 Battle Flow

```
1. Pre-fight consumables apply (shields, stat boosts, etc.)
2. onFightStart passives fire for both sides
3. Turn loop begins (max 60 turns):
   ├── Determine turn order (speed + random)
   ├── First actor attacks
   ├── Second actor attacks (if alive)
   └── Check for death
4. If max turns reached without KO → higher HP % wins
5. Post-battle: onWin/onLose passives, XP & coin rewards
```

### 3.3 Turn Order

```
yourSpeed    + random(0, 8)
opponentSpeed + random(0, 8)
```
Whoever rolls higher **acts first** that turn. Both sides still get to attack (unless the first attacker kills the opponent).

### 3.4 Evasion

Before damage is calculated, the defender gets a chance to **completely avoid** the attack:

```
evasionChance = clamp(
    4% + defenderSpeed × 0.2% - attackerSpeed × 0.1% + flatEvasionBonus%/100,
    2%,   ← minimum (always at least 2% chance)
    80%   ← maximum (capped at 80%)
)
```

If the random roll is less than the evasion chance: **0 damage, "MISS!"**.

> **Example:** You have 50 Speed and +5% evasion from passives. Enemy has 30 Speed.
> `evasion = 4 + 50×0.2 - 30×0.1 + 5 = 4 + 10 - 3 + 5 = 16%` chance to evade.

### 3.5 The Core Damage Formula

This is the heart of the entire combat system. It runs through these steps in order:

#### Step 1: Attack Roll

```
attackRoll = attackerPower × 1.8 + attackerSpeed × 0.7 + rarityPower × 0.2 + random(-6, 12)
```

- Power is the dominant factor (×1.8)
- Speed provides secondary offense (×0.7)
- Rarity adds a small fixed bonus to both attack and defense rolls
- Random noise: -6 to +12 (slightly biased upward)

#### Step 2: Defense Roll

```
defenseRoll = defenderGuard × 1.6 + defenderSpeed × 0.35 + rarityPower × 0.2 + random(-4, 8)
```

- Guard is the dominant defensive factor (×1.6)
- Speed gives minor defense (×0.35)
- Random noise: -4 to +8 (slightly biased upward)

#### Step 3: Raw Damage

```
rawDamage = max(1, floor(attackRoll - defenseRoll × 0.55))
```

Defense is only **55% effective** — offense naturally outscales defense. Minimum 1 damage.

#### Step 4: Flat & Percentage Damage Modifiers

```
damage = rawDamage + attackerFlatDamageBonus
damage = floor(damage × (1 + attackerDamagePctBonus / 100))
```

These come from equipment sub-stats, skill tree passives, and consumables.

#### Step 5: Critical Hits

```
critChance = clamp(5% + bonusCritChance/100, 5%, 95%)

if random < critChance:
    damage = max(1, floor(damage × (1.0 + critDmgPct/100)))
```

- **Base crit chance: 5%** (always a small chance)
- **Base crit damage multiplier: 1.0 + bonus from equipment** (defaults to 1.0, meaning no extra damage without gear)
- Crit is **disabled** during super-effective element advantage
- Max crit chance capped at 95%

> **Example:** 20% crit chance from gear + 60% crit damage from gear.
> `critChance = 5 + 20 = 25%`. On crit: `damage × (1.0 + 0.60) = 1.60×`.

#### Step 6: Defense Reduction (applied to attacker's damage)

```
damage = floor(damage / (1 + defenderDamageReductionPct / 100))
damage = damage - defenderFlatDamageReduction
damage = max(1, damage)
```

The percentage reduction is a **divisor**, not a multiplier — so 50% reduction means damage ÷ 1.5 (≈ 67% of original), not damage × 0.5.

#### Step 7: Element Effectiveness

Applied **after** all the above:

```
if super-effective:
    finalDamage = max(1, floor(damage × (1.5 + effectHit × 0.02)))
if not-very-effective:
    finalDamage = max(1, floor(damage × 0.5))
```

#### Step 8: True Damage

```
finalDamage = finalDamage + trueDamage
```

True damage bypasses ALL defense, reduction, and shields. Only a few rare consumables/effects provide it.

#### Step 9: Shield Absorption

If the defender has an active shield:
- Damage is subtracted from the shield first
- Any remainder goes to HP
- Shields from `onFightStart` passives (e.g., Sacred Candles, Red Tonic)

#### Step 10: Post-Hit Effects

After damage lands:
- **Vampiric Fang**: attacker heals `finalDamage × vampiricHealPct / 100`
- **Reflect**: attacker takes reflected damage back
- **Counter**: attacker takes `receivedDamage × counterPct / 100`
- **Death Save (Phoenix Feather)**: if HP would hit 0, survive at 1 HP
- **Self-Revive (Chrono Vial)**: if HP% drops below threshold, full heal

### 3.6 Max HP Formula

```
guardBonus   = floor(guard × 2.2)
utilityBonus = floor((power + speed) × 0.35)
base         = max(30, hpBase + guardBonus + utilityBonus)
maxHp        = max(30, floor(base × (1 + hpPct/100)))
```

- `hpBase` includes: level-up HP, skill tree HP, equipment flat HP
- `hpPct` comes from equipment sub-stats
- **Guard gives the most HP per point** (2.2×), followed by Power+Speed (0.35× combined)

> **Example:** Level 20 character with 50 Guard, 40 Power, 30 Speed, +40 HP from gear, +10% HP from gear.
> `guardBonus = 50 × 2.2 = 110`
> `utilityBonus = (40 + 30) × 0.35 = 24.5 → 24`
> `base = max(30, 40 + 110 + 24) = 174`
> `maxHp = max(30, floor(174 × 1.10)) = 191 HP`

### 3.7 Win Conditions (60-turn cap)

| Scenario | Winner |
|----------|--------|
| One combatant reaches 0 HP | The survivor wins |
| Both reach 0 HP in same turn | Tiebreaker: higher Power → higher Speed → coin flip |
| 60 turns elapsed, both alive | Higher **HP percentage** wins → then Power → Speed → coin flip |

### 3.8 Faster Wins = More Rewards

The number of **rounds won** (attacks that land) affects your XP multiplier:

```
baseXpMultiplier = clamp(4 - ceil(turns / 6), 1, 3)
```

- Win in ≤5 turns → **3× multiplier**
- Win in 6–11 turns → **2× multiplier**
- Win in 12+ turns → **1× multiplier**

Speed-focused builds that end fights fast earn more XP!

---

## 4. Equipment

### 4.1 Equipment Slots

| Slot | Main Stat | Cost |
|------|-----------|:----:|
| **Weapon** | Power (1–10) | 1,000 coins |
| **Armour** | Guard (1–10) | 1,000 coins |
| **Charm** | Crit Rate (5–25%) **or** Crit DMG (10–60%) | 1,000 coins |

Each piece also gets **4 random sub-stats** from this pool:

| Sub-stat | Range |
|----------|:-----:|
| HP (flat) | 30–50 |
| Power | 1–10 |
| Guard | 1–10 |
| Speed | 1–10 |
| Effect Hit | 1–10 |
| HP% | 1–10% |
| Damage% | 5–45% |
| Defense% | 5–30% |
| Crit Rate% | 5–25% |
| Crit DMG% | 10–60% |

**All sub-stats are unique** — you won't get the same sub-stat twice on one piece.

### 4.2 Equipment Weight for Matchmaking

```
equipmentWeight = power × 2.0 + guard × 1.7 + speed × 1.5
```

This contributes to your "round power" used for opponent matching.

---

## 5. Consumables

Consumables provide temporary or charge-limited effects. You buy them, then "use" them to activate.

### 5.1 Full Consumable Catalog

| Consumable | Effect | Charges / Duration |
|------------|--------|:------------------:|
| **Red Tonic** | 60 HP shield at fight start | 100 fights |
| **Berserker's Brew** | +20% damage | 100 fights |
| **Scout's Whistle** | +12% speed | 100 fights |
| **Frost Elixir** | +35% evasion | 250 fights |
| **Viridian Elixir** | +5 random IV points to current card | 250 charges |
| **Fuse Bomb** | First hit deals 100 true damage | 250 charges |
| **Sage's Tome** | +100% XP from wins | 250 wins |
| **Phoenix Feather** | Survive fatal hit with 1 HP | 500 charges |
| **Titan Draught** | +15% to all stats (P/G/S/EH) | 500 fights |
| **Lantern Oil** | +50% damage vs higher-rarity opponents | 500 charges |
| **Seeker Lens** | +20% crit chance | 750 fights |
| **Oath Ribbon** | +15% guard | 750 fights |
| **Arcane Mirror** | Match opponent's rarity for damage calc | 750 charges |
| **Prism Draught** | Double first attack damage | 1,000 charges |
| **Sacred Candles** | 80 HP shield at fight start | 1,000 fights |
| **Vampiric Fang** | 20% lifesteal on damage dealt | 1,000 fights |
| **Solar Cauldron** | +1 to all 5 stats (HP/P/G/S/EH) permanently, **account-wide** — benefits every card. 7-day cooldown. | Permanent |
| **Void Cauldron** | Double passive trigger chance (2×) | 1,000 fights |
| **Chrono Vial** | Full HP restore when HP drops below 20% | 1,000 charges |

### 5.2 Consumable Waste Prevention

The UI prevents you from using a consumable if you already have more than `charges × 2` remaining (to avoid wasting overlaps).

---

## 6. Skill Tree

### 6.1 Structure

- **3 branches**: Offense 🔴, Defense 🔵, Utility 🟣
- **3 chains per branch**, **5 nodes per chain** = **45 total nodes**
- Nodes are sequential — you must unlock Tier 1 before Tier 2, etc.

### 6.2 Offense Branch (Attack Power & Speed)

| Chain | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|-------|:------:|:------:|:------:|:------:|:------:|
| **Might** | +2 Power | +3 Power | +4 Power | +5 Power | +7 Power |
| **Swiftness** | +1 Speed | +1 Speed | +2 Speed | +2 Speed | +3 Speed |
| **Fury** | Heavy Hand (+2 flat dmg) | Keen Edge (+3% crit) | Momentum (8% speed→dmg) | Battle Heat (+4% dmg) | Relentless (8% chance extra strike 35% dmg, 1/fight) |

### 6.3 Defense Branch (Survivability)

| Chain | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|-------|:------:|:------:|:------:|:------:|:------:|
| **Vitality** | +8 HP | +10 HP | +14 HP | +18 HP | +25 HP |
| **Bulwark** | +1 Guard | +2 Guard | +3 Guard | +4 Guard | +5 Guard |
| **Resolve** | Preparation (6pt shield) | Steady Guard (-1 dmg taken) | Second Wind (10% chance heal 3 HP, 2/fight) | Critical Ward (cancel 1 crit) | Iron Resolve (-5% dmg taken) |

### 6.4 Utility Branch (Effect Hit, Hybrid, Economy)

| Chain | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|-------|:------:|:------:|:------:|:------:|:------:|
| **Fortune** | +1 EH | +1 EH | +2 EH | +2 EH | +3 EH |
| **Adaptation** | +5 HP | +2 Guard | +2 Speed | +3 Power | +3 EH |
| **Prosperity** | +3% coins | +3% XP | +2% evasion | +8% rarity coins | +5% XP & coins |

### 6.5 Skill Points

- **Earned:** 1 point per level (`level - 1` total at any level)
- **Reset cost:** `level × 100` coins (refunds all points)
- Points are spent by activating nodes in the skill tree UI

## 7. Shop

### 7.1 Card Shop

- **5 daily offers** at fixed rarity-based prices:

| Rarity | Price |
|--------|:-----:|
| C | 50 coins |
| R | 100 coins |
| SR | 1,000 coins |
| SSR | 5,000 coins |
| UR | 10,000 coins |

- **Random pack**: 5 random cards for **2,500 coins** — available **Sun, Tue, Thu, Sat only**

### 7.2 Equipment Shop

- Weapon / Armour / Charm at 1,000 coins each
- **Stats are randomised on purchase** — you see the stats only after buying
- Can "fodder" (sell) unwanted pieces for half price (500 coins)

### 7.3 Tiered Shop

- Consumables organized by tier
- Unlock thresholds: level 1, 8 (Bronze), 16 (Silver), 28 (Gold), 42 (Mythic), 58 (Cosmic)
- Items with cooldowns display remaining time

---

## 8. Marketplace & Trading

### 8.1 Player Market

- List your cards for sale at any price (1–1,000,000 coins)
- **Maximum 20 active listings** per player
- Browse with filters: rarity, IV band, price, search
- Price guide shows average from last 30 sold similar cards (or shop baseline if no data)
- **Seller gets full listing price**, buyer gets the card
- Real-time updates via WebSocket

### 8.2 IV Bands (Market Filtering)

| Band | IV Total Range |
|------|:--------------:|
| Low | 0–31 |
| Medium | 32–62 |
| High | 63–93 |
| Perfect | 94–124 |

### 8.3 Trading

- Create trade listings offering your card for: a specific card, a specific rarity, or a specific element
- Browse other players' listings and send trade requests
- **Trade session**: both sides offer cards + coins → both confirm → atomic swap
- Sessions time out after **5 minutes**
- Real-time updates via WebSocket
- **Maximum 20 active trade listings** per player

---

## 9. Experience & Leveling

### 9.1 XP to Level

```
xpToNext(level) = 80 + 40 × level²
```

| Level | XP to Next | Cumulative |
|:-----:|:----------:|:----------:|
| 1 | 120 | 120 |
| 5 | 1,080 | ~2,880 |
| 10 | 4,080 | ~16,000 |
| 20 | 16,080 | ~110,000 |
| 30 | 36,080 | ~350,000 |
| 50 | 100,080 | ~1,700,000 |
| 70 | 196,080 | ~4,700,000 |

**Max level: 70.** At level 70, you stop gaining levels and remaining XP is zeroed out.

### 9.2 XP Earned Per Win

```
baseXp = 10 + floor(opponentLevel × 2.5) + roundsWon × 2 + min(winStreak, 10)
```

- Higher-level opponents give more XP
- Faster wins (more roundsWon) give more XP
- Win streak bonus caps at 10
- **Multiplied by XP boosts** from skill tree, consumables (Sage's Tome = +100%), and passives

### 9.3 Level-Up Stat Gains

Every profile starts with base stats at level 1:

| Stat | Base |
|------|:----:|
| HP | 120 |
| Power | 12 |
| Guard | 12 |
| Speed | 10 |
| Effect Hit | 3 |

Every level grants: **+8 HP, +2 Power, +2 Guard, +1 Speed, +1 Effect Hit**

| Level | Cumulative HP | Cumulative P/G | Cumulative S/EH |
|:-----:|:------------:|:--------------:|:---------------:|
| 1 | +8 | +2 | +1 |
| 10 | +80 | +20 | +10 |
| 25 | +200 | +50 | +25 |
| 50 | +400 | +100 | +50 |
| 70 | +560 | +140 | +70 |

### 9.4 Coins Earned Per Win

```
baseCoins = 18 + opponentLevel × 3 + rarityCoinReward
```

- `rarityCoinReward`: based on **your card's rarity** — C=0, R=3, SR=7, SSR=12, UR=18
- Multiplied by `(1 + rarityCoinPct/100)` from passives (e.g., Prosperity chain)
- Modified by general coin boost passives and effects

---

## 10. ELO Rating System

### 10.1 Rating Parameters

| Parameter | Value |
|-----------|:-----:|
| Default rating | 1,000 |
| Minimum rating | 100 |
| Scale factor | 400 |

### 10.2 K-Factor by Experience

| Matches Played | K-Factor | Max Delta | Label |
|:--------------:|:--------:|:---------:|-------|
| 0–9 | 48 | ±48 | **Provisional** |
| 10–59 | 24 | ±32 | Established |
| 60+ | 16 | — | Veteran |

### 10.3 ELO Exchange Formula

```
expectedScore = 1 / (1 + 10^(ratingDiff / 400))
avgK = round((winnerK + loserK) / 2)
rawDelta = round(avgK × (1 - expectedScore))

// Large gap penalty (when rating difference > 600):
largeGapPenalty = 0.5 + (600 / (abs(ratingDiff) + 600))
finalDelta = round(max(1, rawDelta × largeGapPenalty))
```

> **Example:** 1200-rated player beats 1000-rated player (both established, K=24):
> `expected = 1 / (1 + 10^(200/400)) = 1 / (1 + 3.162) = 0.24`
> `delta = 24 × (1 - 0.24) = 24 × 0.76 = 18 points`
> Winner → 1218, Loser → 982.

### 10.4 Matchmaking

- Excludes your last **5 opponents** (no immediate rematches)
- Finds opponents closest to your rating
- Weighted random selection: `weight = 1 / (1 + abs(eloDiff) / 50)`
- Closer opponents are more likely to be chosen, but not guaranteed

---

## 11. Rainbow Cards (Minting)

### 11.1 What Are Rainbow Cards?

Rainbow cards are **forged from two identical cards** of the same character. They get:
- A "Rainbow" title suffix
- A special holographic visual texture (7-color gradient)
- +5 bonus IV points randomly distributed across their stats

### 11.2 Minting Process

1. Go to **Mint** page — view your duplicate groups
2. Select two identical (non-rainbow) cards
3. Preview the result — base IVs come from Card 1, then +5 points are distributed
4. **IV distribution logic**: Each bonus point is randomly assigned to one of the 4 IV stats (Power, Guard, Speed, Effect Hit). No stat can exceed 31.
5. Confirm → both cards are consumed, rainbow card created

### 11.3 Rainbow Cards Are Fully Functional

- Usable in fights, trades, and marketplace just like normal cards
- The rainbow texture is purely cosmetic (but the +5 IVs are real!)

---

## 12. NPC Opponents

Players below **level 5** fight only bots. There are 5 NPC templates:

| NPC | Level | Rarity | Stat % |
|-----|:-----:|:------:|:------:|
| Training Slime | 1 | C | 75% |
| Copper Golem | 2 | C | 78% |
| Forest Wisp | 3 | C | 80% |
| Iron Squire | 4 | C | 82% |
| Shadow Pupil | 5 | R | 85% |

- Stat % means they use 75–85% of normal stats for that level
- NPC ELO is `600 + random(0, 400)` — always beatable
- At level 5+, you transition to PvP matchmaking

---

## 13. Fight Cooldowns & Guards

### 13.1 Cooldown

- **5 seconds** between fights
- Can be bypassed with a **Gate Key** consumable

### 13.2 Rate Limiting

- Maximum **30 fights per 60 seconds** per account AND per IP address
- This prevents botting and server abuse

---

## 14. Strategies & Tips

### 14.1 Build Archetypes

| Archetype | Focus Stats | Key Items | Playstyle |
|-----------|------------|-----------|-----------|
| **Speed Demon** | Speed > Power | Scout's Whistle, Swiftness chain | Act first, evade often, end fights fast for max XP multiplier |
| **Berserker** | Power > Guard | Berserker's Brew, Might chain | Hit hard, ignore defense, win before they kill you |
| **Turtle** | Guard > HP | Oath Ribbon, Vitality + Bulwark chains | Outlast opponents, win by HP percentage at turn 60 |
| **Crit Fisher** | Power + Crit | Seeker Lens, crit charm | Stack crit chance and damage for explosive turns |
| **Elementalist** | Effect Hit > Power | Fortune chain, element-match cards | Abuse super-effective multipliers (1.8×+) |
| **Lifesteal Tank** | Guard + Power | Vampiric Fang, Chrono Vial | Heal while dealing damage, near-unkillable in long fights |
| **Burst** | Power + Speed | Prism Draught, Fuse Bomb | Double first attack + true damage → kill in 1–2 turns |

### 14.2 Economy Tips

- **Sage's Tome (+100% XP)** is the best investment for leveling fast
- **Prosperity chain** in Utility tree pays for itself over time (+3% coins, +3% XP, +2% evasion, +8% rarity coins, +5% both)
- Sell unwanted equipment for **500 coins** (fodder)
- Cards drawn daily are free — check the shop's random pack on eligible days
- Higher-rarity opponents give more coins — climb ELO to face better opponents

### 14.3 Combat Tips

- **Speed determines turn order** — acting first means you might kill before they attack
- **Element advantage disables crits** — if you have advantage, crit gear is wasted; stack raw damage instead
- **Evasion caps at 80%** — don't overstack beyond that
- **Defense is only 55% effective** — pure tanking loses to pure offense; balance is key
- **Shields absorb damage before HP** — Red Tonic/Sacred Candles are effectively bonus HP
- **Death Save (Phoenix Feather)** wins close fights — 1 HP is enough if you kill them next hit
- **Win streak XP bonus caps at 10** — after 10 consecutive wins, you're at max efficiency

### 14.4 Collection Tips

- **High IV cards are the foundation** — a card with 100+ IV total is worth investing in
- **Rainbow minting gives +5 IVs** — always mint duplicates of cards you plan to use
- **The market is cheaper than the shop** for specific cards — browse before buying packs
- **Favorite cards** to prevent accidentally selling/foddering them

### 14.5 Progression Roadmap

```
Level 1–4:   Fight NPCs → save coins → buy first equipment
Level 5–10:  PvP begins → max daily draws → Prosperity chain
Level 10–20: Buy first consumables → build skill tree → find good IV card
Level 20–30: Tier 3 gear → market trading → rainbow minting
Level 30–40: Optimize build → climb ELO → tier 4 gear
Level 40–50: Endgame consumables → perfect IV hunting → tier 5 gear
Level 50–70: Endgame consumables → perfect IVs → leaderboard chase → Solar Cauldron
```

---

## Appendix A: Passive Ability Reference

Passives are attached to skill tree nodes. They trigger on specific events.

### Trigger Types

| Trigger | When It Fires |
|---------|---------------|
| `onFightStart` | At the very beginning of battle (shields, initial buffs) |
| `onAttack` | When the wielder attacks (damage bonuses, crit boosts) |
| `onDamageTaken` | When the wielder takes damage (reductions, reflects, counters) |
| `onDamageDealt` | After dealing damage (extra strikes, damage amplification) |
| `onWin` | After winning a fight (bonus XP, coins) |
| `onLose` | After losing a fight |

### Action Types

| Action | Effect |
|--------|--------|
| `addFlatDamage` | Add N flat damage to each attack |
| `scaleDamagePct` | Increase damage by N% |
| `scaleBySpeedPct` | Add N% of Speed as flat damage |
| `bonusCritChancePct` | Increase crit chance by N% |
| `reduceIncomingDamagePct` | Reduce incoming damage by N% |
| `reduceIncomingDamageFlat` | Reduce incoming damage by N flat |
| `applyShield` | Gain N HP shield at fight start |
| `healFlat` | Restore N HP |
| `rewardBonusPct` | +N% XP or coins from wins |
| `rarityCoinBonusPct` | +N% rarity-based coin bonus |
| `reflectFlatDamage` | Reflect N damage back to attacker |
| `counterDamagePct` | Counter for N% of received damage |
| `addEvasionPct` | +N% evasion chance |
| `grantTempGuard` | Temporary +N Guard for X turns |
| `cancelCritical` | Nullify N critical hits against you |
| `reduceElementEffectivenessPct` | Reduce enemy element advantage by N% |
| `extraStrikePct` | N% chance for extra hit at specified % damage |
| `trueDamage` | Add N true damage (bypasses all mitigation) |

### Priority System

When multiple passives share the same action key:
1. **Higher-tier gear wins** over lower-tier
2. If same tier: **higher magnitude wins**
3. If same magnitude: **most recently equipped wins**

### Conditional Triggers

Some passives only activate conditionally. Examples:

- `attack.turn == 1` — only on first attack of the fight
- `attack.isFirstActor == true` — only when acting first in a turn
- `defender.hpPct > 70` — only when target is above 70% HP
- `self.hpPct < 40` — only when self is below 40% HP
- `attack.critical == true` — only on critical hits
- `attack.elementEffective == "super-effective"` — only with element advantage

---

## Appendix B: Quick Formula Reference Card

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MAX HP
  maxHp = max(30, (hpBase + G×2.2 + (P+S)×0.35) × (1 + hpPct%/100))
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ATTACK ROLL
  atkRoll = P×1.8 + S×0.7 + rarityPwr×0.2 + rand(-6,12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEFENSE ROLL
  defRoll = G×1.6 + S×0.35 + rarityPwr×0.2 + rand(-4,8)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RAW DAMAGE
  dmg = max(1, atkRoll - defRoll×0.55)
  dmg += flatBonus   →   dmg ×= (1 + pctBonus/100)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRIT
  chance = max(5%, 5% + bonus%/100), cap 95%
  critDmg = dmg × (1.0 + critDmgPct/100)
  ⚠ Disabled during super-effective elements
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEFENSE REDUCTION
  dmg = dmg / (1 + defRedPct/100) - flatRed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ELEMENT
  Super-effective:  dmg × (1.5 + EH×0.02)  [min 1.5×]
  Not-very-effective: dmg × 0.5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EVASION
  chance = 4% + defS×0.2% - atkS×0.1% + flat%
  clamped: 2%–80%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  XP TO LEVEL
  xpNeeded = 80 + 40 × level²
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WIN XP
  baseXp = 10 + oppLvl×2.5 + roundsWon×2 + min(streak,10)
  × (1 + xpBoost%/100)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WIN COINS
  baseCoins = 18 + oppLvl×3 + yourCardRarityBonus
  yourCardRarityBonus: C=0, R=3, SR=7, SSR=12, UR=18
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ELO EXCHANGE
  expected = 1 / (1 + 10^(diff/400))
  delta = K × (1 - expected)
  K: 48 (provisional), 24 (established), 16 (veteran)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TURN ORDER
  mySpeed + rand(0,8)  vs  oppSpeed + rand(0,8)
  Higher roll acts first.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LEVEL UP GAINS (per level)
  +8 HP, +2 Power, +2 Guard, +1 Speed, +1 Effect Hit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IV TO STAT CONVERSION
  HP bonus:     floor(guardIV / 2)
  P/G/S/EH:     floor(iv / 3) each
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*This guide covers the Arena system as of June 2026. Mechanics may evolve — check the in-game Arena Updates panel for the latest changes!*
