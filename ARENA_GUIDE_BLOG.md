# 🏟️ Mirabellier Arena: The Complete Mechanics Guide

**Everything you need to know about cards, combat, and climbing the ladder — with all the math explained.**

---

Welcome to the Arena! Whether you're a newcomer puzzling over your first card draw or a veteran climbing the leaderboard, this guide has you covered. We're going to walk through every system, every formula, and every strategy — from the five core stats all the way down to how the server flips coins on turn 60.

Grab your favourite card, equip your best gear, and let's dive in. ✨

---

## 📋 Table of Contents

- [The Five Core Stats](#the-five-core-stats)
- [Cards: Rarity, IVs & Drawing](#cards-rarity-ivs--drawing)
- [How Combat Actually Works](#how-combat-actually-works)
- [The Damage Formula (Step by Step)](#the-damage-formula-step-by-step)
- [Equipment & Gearing](#equipment--gearing)
- [Consumables: Your Battle Bag](#consumables-your-battle-bag)
- [The Skill Tree](#the-skill-tree)
- [The Shop Economy](#the-shop-economy)
- [Marketplace & Trading](#marketplace--trading)
- [Experience, Leveling & Coins](#experience-leveling--coins)
- [The ELO Rating System](#the-elo-rating-system)
- [Rainbow Cards (Minting)](#rainbow-cards-minting)
- [NPC Opponents (Levels 1–4)](#npc-opponents-levels-14)
- [Fight Cooldowns & Rate Limits](#fight-cooldowns--rate-limits)
- [Builds, Strategies & Progression](#builds-strategies--progression)
- [Passive Abilities Reference](#passive-abilities-reference)
- [Quick Formula Cheat Sheet](#quick-formula-cheat-sheet)

---

## The Five Core Stats

Every fighter in the Arena is defined by five numbers. Understanding what each one does — and how they scale — is the foundation of every good build.

| Stat | Abbreviation | What It Does |
|:-----|:------------:|--------------|
| **HP** | — | Your life total. Hit zero and you lose. |
| **Power** | P | Primary damage stat. Scales your attack roll at **1.8×**. |
| **Guard** | G | Primary defense stat. Contributes **1.6×** to defense rolls and **2.2×** to max HP. |
| **Speed** | S | Determines turn order (higher acts first), evasion chance, and adds **0.7×** to attack rolls plus **0.35×** to defense. |
| **Effect Hit** | EH | Determines super-effective damage via `1.5 + EH × 0.02` (each point adds 0.02× on top of the 1.5× element matchup). Also dampens enemy element advantage through passives. |

> 💡 **Key insight:** Guard is secretly the best defensive stat because it not only reduces incoming damage but also gives you **more HP than any other stat** (2.2× vs 0.35× for Power+Speed combined). A point of Guard is worth about 6× more HP than a point of Power.

---

## Cards: Rarity, IVs & Drawing

### What's on a Card?

Every card in your collection represents an anime character and carries:

- **A MyAnimeList character ID** linking it to the source material
- **Title** — character name and their anime of origin
- **Rarity** — one of five tiers (C, R, SR, SSR, UR)
- **Element** — Fire 🔥, Water 💧, Earth 🌿, Wind 🍃, Light ✨, or Dark 🌑
- **IVs** (Individual Values) — four numbers from 0 to 31 in Power, Guard, Speed, and Effect Hit
- **Rainbow status** — whether the card was forged from duplicates

### How Rarity Works

Rarity isn't random — it's based on a character's **popularity rank** in the MyAnimeList catalog. The more popular the character, the higher their rarity tier.

| Rarity | % of Catalog | Frame |
|:-------|:------------:|-------|
| **UR** (Ultra Rare) | Top 1% | Gold prismatic, 5 stars |
| **SSR** | Next 4% | Red/rose, 4 stars |
| **SR** | Next 10% | Purple, 3 stars |
| **R** (Rare) | Next 25% | Blue/silver, 2 stars |
| **C** (Common) | Remaining 60% | Brown, 1 star |

Rarity matters in combat too — each tier provides a flat bonus to **both attack and defense rolls** at `rarityPower × 0.2`:

| Rarity | Combat Bonus |
|:-------|:-----------------:|
| C | 0 |
| R | +3 |
| SR | +7 |
| SSR | +12 |
| UR | +18 |

### Understanding IVs (Individual Values)

Think of IVs like a card's "genetics." Each card rolls four IVs (one per combat stat) in the range **0–31**. The **IV total** (sum of all four) ranges from 0 to 124.

Here's how IVs translate into actual combat stats:

| IV Stat | Combat Bonus |
|:--------|:-------------|
| Power IV | `floor(powerIV ÷ 3)` added to Power |
| Guard IV | `floor(guardIV ÷ 3)` added to Guard **and** `floor(guardIV ÷ 2)` added to HP |
| Speed IV | `floor(speedIV ÷ 3)` added to Speed |
| Effect Hit IV | `floor(effectHitIV ÷ 3)` added to Effect Hit |

> 🌟 **A "perfect" card** (31/31/31/31) gives: **+10 Power, +10 Guard, +15 HP, +10 Speed, +10 Effect Hit.**

### Hidden Metadata Bonuses

Cards also carry two invisible "power" bonuses used for matchmaking calculations:

```
malScoreBonus  = clamp((meanScore - 6) × 4, 0, 16)
popularityBonus = clamp((2500 - popularityRank) ÷ 250, 0, 10)
```

A card with a MAL score of 10 gets **+16 bonus power**. The #1 most popular character gets **+10**. These don't affect combat — just who the system matches you against.

### Drawing Cards

- **10 free draws per day** (reset at midnight UTC)
- A **pack** is 5 draws bundled together
- You can track remaining draws on the Arena home page
- Additional cards can be bought from the shop or player market

---

## How Combat Actually Works

### The Element Triangle

The six elements form two **independent** rock-paper-scissors triangles:

```
    🔥 Fire  ──beats──→  🌿 Earth
     ↑                      ↓
     └── 💧 Water ←──beats──┘

    🍃 Wind  ──beats──→  ✨ Light
     ↑                      ↓
     └── 🌑 Dark ←──beats──┘
```

| Situation | Damage Multiplier |
|:----------|:-----------------:|
| **Super-effective** (you counter them) | `1.5 + (Effect Hit × 0.02)` — scales from the 1.5× element matchup |
| Neutral (different triangle, or same element) | **1.0×** |
| **Not very effective** (they counter you) | **0.5×** |

> 🔥 **Example:** Fire vs Earth with 15 Effect Hit → `1.5 + 15 × 0.02 = 1.80×` damage.

> ⚠️ **Critical hits are completely disabled** when you have a super-effective element advantage. This prevents double-dipping on multipliers — if you're already dealing 2.3×, you don't also get to crit.

Some items and passives can **dampen** incoming super-effective damage. The dampened minimum is **1.5×**.

### Battle Flow

Every fight follows this exact sequence:

```
1. Pre-fight consumables activate (shields, stat steroids, etc.)
2. "onFightStart" passives fire on both sides
3. Turn loop (max 60 turns):
   ├── Roll turn order: yourSpeed + random(0–8) vs enemySpeed + random(0–8)
   ├── Higher roll attacks first
   ├── Second combatant attacks (if still alive)
   └── Check for death
4. If turn 60 ends with both alive → higher HP% wins
5. Post-battle: rewards calculated, passives fire
```

### Turn Order

```
you:  yourSpeed    + random(0, 8)
them: enemySpeed   + random(0, 8)
```

Higher total goes first. Both sides always attack unless the first attacker scores a knockout. On ties, it's a coin flip.

### Evasion

Before any damage calculation, the defender can **completely dodge** the attack:

```
evasionChance = clamp(
    4% + (defenderSpeed × 0.2%) - (attackerSpeed × 0.1%) + flatEvasion%/100,
    2%,    ← minimum
    80%    ← maximum
)
```

If the random roll passes: **0 damage, "MISS!"**

> 💨 **Example:** 50 Speed defender with +5% evasion vs 30 Speed attacker:
> `evasion = 4 + (50×0.2) - (30×0.1) + 5 = 4 + 10 - 3 + 5 = 16% chance`

### How You Win

| Situation | Winner |
|:----------|:-------|
| One combatant hits 0 HP | The survivor |
| Both hit 0 in the same turn | Tiebreaker: higher Power → higher Speed → coin flip |
| Turn 60 with both alive | Higher **HP percentage** → Power → Speed → coin flip |

### The Speed Multiplier on XP

Winning faster gives you **more XP**:

```
xpMultiplier = clamp(4 - ceil(turns ÷ 6), 1, 3)
```

- Win in **5 turns or fewer** → **3× XP**
- Win in **6–11 turns** → **2× XP**
- Win in **12+ turns** → **1× XP**

Speed-focused builds don't just win — they **level faster.**

---

## The Damage Formula (Step by Step)

This is the beating heart of the Arena. The server calculates damage through ten sequential steps every time an attack lands. Here's the complete pipeline:

### Step 1 — Attack Roll

```
attackRoll = (attackerPower × 1.8) + (attackerSpeed × 0.7) + (rarityPower × 0.2) + random(-6, 12)
```

- Power dominates at **1.8×**
- Speed contributes secondary offense at **0.7×**
- Rarity adds a small fixed bonus (0 for C, up to 3.6 for UR) to both attack and defense
- Random noise is **biased upward**: -6 to +12 (average +3)

### Step 2 — Defense Roll

```
defenseRoll = (defenderGuard × 1.6) + (defenderSpeed × 0.35) + (rarityPower × 0.2) + random(-4, 8)
```

- Guard is the primary defense factor at **1.6×**
- Speed adds minor defense at **0.35×**
- Random noise: -4 to +8 (average +2)

### Step 3 — Raw Damage

```
rawDamage = max(1, attackRoll - defenseRoll × 0.55)
```

> 🔑 **Critical detail:** Defense is only **55% effective** against the attack roll. Offense naturally outscales defense — this is by design. Pure tanking will never completely wall a dedicated attacker. Minimum 1 damage.

### Step 4 — Flat & Percentage Modifiers

```
damage = rawDamage + flatDamageBonuses
damage = floor(damage × (1 + damagePctBonuses ÷ 100))
```

These bonuses come from equipment sub-stats, skill tree passives, and active consumables. Flat bonuses apply first, then percentage.

### Step 5 — Critical Hits

```
critChance = clamp(5% + bonusCritChance ÷ 100, 5%, 95%)

if random < critChance:
    damage = max(1, floor(damage × (1.0 + critDmgPct ÷ 100)))
```

- **Base crit chance: 5%** — everyone has a small shot
- **Base crit multiplier: 1.0×** — without crit damage gear, crits don't actually do more damage
- Cap: 95% max crit chance
- **Disabled** during super-effective elements

> 🎯 **Example:** 20% bonus crit chance + 60% crit damage from gear.
> `critChance = 5% + 20% = 25%`. On crit: `damage × 1.60`.

### Step 6 — Defense Reductions

```
damage = floor(damage ÷ (1 + defenderDamageReductionPct ÷ 100))
damage = damage - defenderFlatDamageReduction
damage = max(1, damage)
```

> ⚠️ **Important:** Percentage reduction is a **divisor**, not a multiplier. 50% reduction means `damage ÷ 1.5 ≈ 67%` of original, not `damage × 0.5`. Stacking "damage reduction" has diminishing returns.

### Step 7 — Element Effectiveness

Applied **after** all other damage math:

```
Super-effective:     damage × (1.5 + effectHit × 0.02)    [minimum 1.5×]
Not-very-effective:  damage × 0.5
Neutral:             damage × 1.0
```

### Step 8 — True Damage

```
finalDamage = finalDamage + trueDamage
```

True damage bypasses **everything** — defense rolls, damage reduction, shields, and element modifiers. Only a few rare consumables provide it. If you see "100 true damage" on a Fuse Bomb, that's exactly 100 HP gone, no questions asked.

### Step 9 — Shield Absorption

If the defender has an active shield (from Red Tonic, Sacred Candles, or passives):
- Damage subtracts from shield HP first
- Only leftover damage hits real HP
- Think of shields as temporary bonus HP

### Step 10 — Post-Hit Effects

After damage lands, these trigger in order:

| Effect | What Happens |
|:-------|:-------------|
| **Vampiric Fang** | Attacker heals for `damageDealt × lifesteal% ÷ 100` |
| **Reflect** | Attacker takes flat reflected damage back |
| **Counter** | Attacker takes `damageReceived × counter% ÷ 100` |
| **Death Save** | If HP would hit 0, survive at 1 HP (Phoenix Feather) |
| **Self-Revive** | If HP drops below threshold, full HP restore (Chrono Vial) |

### Max HP Formula

Your total HP is calculated as:

```
guardBonus   = floor(guard × 2.2)
utilityBonus = floor((power + speed) × 0.35)
base         = max(30, hpBase + guardBonus + utilityBonus)
maxHp        = max(30, floor(base × (1 + hpPct ÷ 100)))
```

- `hpBase` = level-up HP + skill tree HP + equipment flat HP
- `hpPct` = percentage HP from equipment sub-stats

> 📐 **Example:** Level 20, 50 Guard, 40 Power, 30 Speed, +40 gear HP, +10% HP from gear.
> - `guardBonus = 50 × 2.2 = 110`
> - `utilityBonus = (40 + 30) × 0.35 = 24`
> - `base = 40 + 110 + 24 = 174`
> - `maxHp = floor(174 × 1.10) = 191 HP`

---

## Equipment & Gearing

### The Three Slots

| Slot | Main Stat | Price |
|:-----|:----------|:-----:|
| **Weapon** | Power (1–10) | 1,000 coins |
| **Armour** | Guard (1–10) | 1,000 coins |
| **Charm** | Crit Rate (5–25%) **or** Crit DMG (10–60%) | 1,000 coins |

### Sub-Stats

Every piece rolls **4 unique sub-stats** from this pool:

| Sub-stat | Range |
|:---------|:-----:|
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

> 🎲 **Stats are randomised on purchase.** You see what you got only after buying. Unwanted pieces can be sold back for 500 coins ("fodder").

### Equipment Weight (Matchmaking)

Your gear contributes to your matchmaking power:

```
equipmentWeight = power × 2.0 + guard × 1.7 + speed × 1.5
```

---

## Consumables: Your Battle Bag

Consumables are temporary or charge-limited buffs. Buy them, then **"use"** them to activate. The game prevents you from wasting charges — you can't re-apply a consumable if you already have more than `charges × 2` remaining.

### Complete Consumable Catalog

| Consumable | What It Does | Duration |
|:-----------|:-------------|:--------:|
| **Red Tonic** | 60 HP shield at fight start | 100 fights |
| **Berserker's Brew** | +20% damage boost | 100 fights |
| **Scout's Whistle** | +12% speed boost | 100 fights |
| **Frost Elixir** | +35% evasion | 250 fights |
| **Viridian Elixir** | +5 random IV points to your card | 250 charges |
| **Fuse Bomb** | First hit deals 100 true damage | 250 charges |
| **Sage's Tome** | +100% XP from wins | 250 wins |
| **Phoenix Feather** | Survive a killing blow with 1 HP | 500 charges |
| **Titan Draught** | +15% to all stats (P/G/S/EH) | 500 fights |
| **Lantern Oil** | +50% damage vs higher-rarity foes | 500 charges |
| **Seeker Lens** | +20% crit chance | 750 fights |
| **Oath Ribbon** | +15% guard | 750 fights |
| **Arcane Mirror** | Match opponent's rarity for damage calc | 750 charges |
| **Prism Draught** | Double first attack damage | 1,000 charges |
| **Sacred Candles** | 80 HP shield at fight start | 1,000 fights |
| **Vampiric Fang** | 20% lifesteal on damage dealt | 1,000 fights |
| **Solar Cauldron** | +1 to all 5 stats (HP/P/G/S/EH) permanently, **account-wide** — benefits every card you use | Forever (7-day cooldown) |
| **Void Cauldron** | Double passive trigger chance (2×) | 1,000 fights |
| **Chrono Vial** | Full heal when HP drops below 20% | 1,000 charges |

> 🔥 **Standout picks:**
> - **Sage's Tome** is the single best leveling investment — double XP for 250 wins
> - **Phoenix Feather** wins you close fights by cheating death
> - **Solar Cauldron** is the ultimate endgame chase — permanent account-wide stat boosts for every card
> - **Vampiric Fang + Chrono Vial** together create a lifesteal tank that's nearly impossible to kill

---

## The Skill Tree

### Structure

- **3 branches:** Offense 🔴 · Defense 🔵 · Utility 🟣
- **3 chains per branch**, **5 nodes per chain** = **45 total nodes**
- Nodes are sequential — must unlock Tier 1 → Tier 2 → Tier 3 → Tier 4 → Tier 5
- **1 skill point per level** (level 1 starts with 0, level 70 has 69 points)
- Reset cost: `level × 100` coins (refunds all points)

### Offense Branch 🔴

| Chain | T1 | T2 | T3 | T4 | T5 |
|:------|:--:|:--:|:--:|:--:|:--:|
| **Might** | +2 P | +3 P | +4 P | +5 P | +7 P |
| **Swiftness** | +1 S | +1 S | +2 S | +2 S | +3 S |
| **Fury** | +2 flat dmg | +3% crit | 8% speed→dmg | +4% dmg | 8% extra strike (35% dmg) |

**Total from full Offense:** +21 Power, +9 Speed, +2 flat damage, +7% damage, +3% crit, speed-to-damage conversion, and a chance for extra strikes.

### Defense Branch 🔵

| Chain | T1 | T2 | T3 | T4 | T5 |
|:------|:--:|:--:|:--:|:--:|:--:|
| **Vitality** | +8 HP | +10 HP | +14 HP | +18 HP | +25 HP |
| **Bulwark** | +1 G | +2 G | +3 G | +4 G | +5 G |
| **Resolve** | 6pt shield | -1 dmg taken | 10% heal 3 HP (2×) | cancel 1 crit | -5% dmg taken |

**Total from full Defense:** +75 HP, +15 Guard, a shield, flat damage reduction, healing, crit cancellation, and percentage damage reduction.

### Utility Branch 🟣

| Chain | T1 | T2 | T3 | T4 | T5 |
|:------|:--:|:--:|:--:|:--:|:--:|
| **Fortune** | +1 EH | +1 EH | +2 EH | +2 EH | +3 EH |
| **Adaptation** | +5 HP | +2 G | +2 S | +3 P | +3 EH |
| **Prosperity** | +3% coins | +3% XP | +2% evasion | +8% rarity coins | +5% XP & coins |

**Total from full Utility:** +9 Effect Hit, +5 HP, +2 Guard, +2 Speed, +3 Power, +8% coins, +8% XP, +2% evasion, +8% rarity coin bonus.

> 💰 **Prosperity pays for itself.** If you're going to play a lot, max this chain early. The coin and XP bonuses compound over hundreds of fights.

## The Shop Economy

### Card Shop

- **5 daily offers** at fixed rarity prices:

| Rarity | Price |
|:-------|:-----:|
| C | 50 coins |
| R | 100 coins |
| SR | 1,000 coins |
| SSR | 5,000 coins |
| UR | 10,000 coins |

- **Random pack:** 5 random cards for **2,500 coins** — available **Sunday, Tuesday, Thursday, Saturday** only. That's 500 coins per card, which is a bargain if you hit even one SR.

### Equipment Shop

- Weapon / Armour / Charm: **1,000 coins** each
- Stats are revealed after purchase (gacha-style)
- Sell unwanted pieces for 500 coins

### Tiered Shop

- Higher-tier consumables unlock at levels 8, 16, 28, 42, and 58
- Items with cooldowns show remaining time before you can buy again

---

## Marketplace & Trading

### Player Market

- List any card for sale: **1 to 1,000,000 coins**
- **Maximum 20 active listings** per player
- Filters: rarity, IV band, price, text search
- **Price guide:** average from the last 30 sold cards of the same character + IV band. Falls back to shop baseline if no sales data exists.
- Seller receives the full listing price. Buyer gets the card.
- Real-time updates via WebSocket — prices move as trades happen

### IV Bands

| Band | IV Total |
|:-----|:--------:|
| Low | 0–31 |
| Medium | 32–62 |
| High | 63–93 |
| Perfect | 94–124 |

> 🛒 **Pro tip:** The market is almost always cheaper than the card shop for specific characters. Browse before you buy packs.

### Trading

- Offer your card and specify what you want: a specific card, a specific rarity, or a specific element
- Browse listings, send requests, negotiate
- **Trade session:** both sides offer cards + coins → both confirm → **atomic swap**
- Sessions timeout after **5 minutes**
- Max **20 active trade listings**
- Real-time WebSocket updates throughout

---

## Experience, Leveling & Coins

### XP Curve

```
xpToNext(level) = 80 + 40 × level²
```

| Level | XP to Next | Approx. Cumulative |
|:-----:|:----------:|:------------------:|
| 1 | 120 | 120 |
| 5 | 1,080 | 2,880 |
| 10 | 4,080 | 16,000 |
| 20 | 16,080 | 110,000 |
| 30 | 36,080 | 350,000 |
| 50 | 100,080 | 1,700,000 |
| 70 | 196,080 | 4,700,000 |

It's quadratic — each level is noticeably harder than the last. **Max level is 70** — once you hit it, you stop gaining levels and excess XP is cleared.

### XP Per Win

```
baseXp = 10 + floor(opponentLevel × 2.5) + (roundsWon × 2) + min(winStreak, 10)
```

Then multiply by XP boosts (Sage's Tome = ×2.0, skill tree bonuses, etc.) and the speed multiplier (up to ×3.0).

- Higher-level opponents = more XP
- Faster wins = more XP (via the roundsWon component and the speed multiplier)
- Win streak bonus caps at **10**

> 📈 **Maximum XP scenario:** Beating a level 70 opponent in under 5 turns on a 10+ win streak with Sage's Tome active:
> `base = 10 + 175 + 10 + 10 = 205`, ×3 (speed) ×2 (Tome) = **1,230 XP per fight.**

### Level-Up Gains

Every profile starts with base stats at level 1:

| Stat | Base |
|------|:----:|
| HP | 120 |
| Power | 12 |
| Guard | 12 |
| Speed | 10 |
| Effect Hit | 3 |

Every single level gives: **+8 HP, +2 Power, +2 Guard, +1 Speed, +1 Effect Hit**

| Level | HP | Power/Guard | Speed/EH |
|:-----:|:--:|:----------:|:--------:|
| 10 | +80 | +20 | +10 |
| 25 | +200 | +50 | +25 |
| 50 | +400 | +100 | +50 |
| 70 | +560 | +140 | +70 |

### Coins Per Win

```
baseCoins = 18 + (opponentLevel × 3) + rarityCoinReward
```

`rarityCoinReward` is based on **your own card's rarity**: C=0, R=3, SR=7, SSR=12, UR=18. It's further multiplied by `(1 + rarityCoinPct/100)` from skill tree passives like Prosperity.

Modified by general coin boost passives and active effects.

---

## The ELO Rating System

The Arena uses a modified ELO system for competitive matchmaking.

### Core Parameters

| Parameter | Value |
|:----------|:-----:|
| Starting rating | 1,000 |
| Minimum rating | 100 |
| Scale factor | 400 |

### K-Factor Tiers

| Matches Played | K | Max Change | Status |
|:-------------:|:--:|:---------:|:-------|
| 0–9 | 48 | ±48 | **Provisional** |
| 10–59 | 24 | ±32 | Established |
| 60+ | 16 | — | Veteran |

Your first 10 matches move your rating quickly to find your skill level. After that, changes slow down.

### The Exchange Formula

```
expectedScore = 1 ÷ (1 + 10^(ratingDiff ÷ 400))
avgK          = round((winnerK + loserK) ÷ 2)
rawDelta      = round(avgK × (1 - expectedScore))
```

**Large gap penalty** (when ratings differ by more than 600):

```
largeGapPenalty = 0.5 + (600 ÷ (abs(ratingDiff) + 600))
finalDelta      = round(max(1, rawDelta × largeGapPenalty))
```

> 🧮 **Example:** 1200 beats 1000 (both established, K=24):
> `expected = 1 ÷ (1 + 3.162) = 0.24`
> `delta = 24 × 0.76 = 18 points`
> Winner: 1218. Loser: 982.

### Matchmaking

- Your last **5 opponents** are excluded (no rematches)
- The system finds candidates closest to your rating
- **Weighted random** selection: `weight = 1 ÷ (1 + |eloDiff| ÷ 50)`
- Closer opponents are more likely but not guaranteed — you might draw a slight underdog or favourite

---

## Rainbow Cards (Minting)

### What They Are

Rainbow cards are **forged from two identical cards** of the same character. They gain:

- 🌈 A special holographic rainbow texture (purely cosmetic)
- ⬆️ **+5 bonus IV points** randomly distributed across their stats
- A "(Rainbow)" title suffix

### The Minting Process

1. Visit the **Mint** page to see your duplicate groups
2. Pick two identical non-rainbow cards
3. Preview the result: base IVs from Card 1, then +5 bonus points
4. **Distribution logic:** Each bonus point randomly picks one of the four IV stats. No stat can exceed 31. The seed is deterministic (based on card IDs), so the preview always matches the result.
5. Confirm → both materials consumed → rainbow card created

> ✨ Rainbow cards function identically to normal cards in fights, trades, and the market. The +5 IVs are real combat stats — only the rainbow shimmer is cosmetic.

---

## NPC Opponents (Levels 1–4)

Before level 5, you fight bots — a gentle introduction to combat:

| Opponent | Level | Rarity | Stat Power |
|:---------|:----:|:------:|:----------:|
| Training Slime | 1 | C | 75% |
| Copper Golem | 2 | C | 78% |
| Forest Wisp | 3 | C | 80% |
| Iron Squire | 4 | C | 82% |
| Shadow Pupil | 5 | R | 85% |

- "Stat power" means they use 75–85% of normal stats for their level
- NPC ELO is `600 + random(0, 400)` — deliberately beatable
- At **level 5**, you graduate to PvP matchmaking

---

## Fight Cooldowns & Rate Limits

| Limit | Value |
|:------|:-----|
| Cooldown between fights | **5 seconds** |
| Bypass | Gate Key consumable |
| Max fights per 60s | **30** (per account + per IP) |

---

## Builds, Strategies & Progression

### Seven Build Archetypes

#### ⚡ Speed Demon
- **Stats:** Speed > Power
- **Items:** Scout's Whistle, Swiftness chain
- **Gameplan:** Act first, evade often, end fights in under 5 turns for 3× XP multiplier

#### 💪 Berserker
- **Stats:** Power > Guard
- **Items:** Berserker's Brew, Might chain
- **Gameplan:** Hit as hard as possible. Kill them before they kill you.

#### 🛡️ Turtle
- **Stats:** Guard > HP
- **Items:** Oath Ribbon, Vitality + Bulwark chains
- **Gameplan:** Outlast opponents. Win by HP percentage when turn 60 arrives.

#### 🎯 Crit Fisher
- **Stats:** Power + Crit
- **Items:** Seeker Lens, crit-focused charm
- **Gameplan:** Stack crit chance and crit damage. Pray for RNG. Explosive turns.

#### 🔥 Elementalist
- **Stats:** Effect Hit > Power
- **Items:** Fortune chain, element-matched cards
- **Gameplan:** Abuse super-effective multipliers. With 30 EH, you're hitting for 2.6×.

#### 🩸 Lifesteal Tank
- **Stats:** Guard + Power
- **Items:** Vampiric Fang + Chrono Vial
- **Gameplan:** Heal while dealing damage. Nearly unkillable in long fights.

#### 💥 Burst
- **Stats:** Power + Speed
- **Items:** Prism Draught + Fuse Bomb
- **Gameplan:** Double first attack + 100 true damage. Win in 1–2 turns.

### Economy Tips

- 🏆 **Sage's Tome first.** Double XP for 250 wins is the single best investment.
- 🌳 **Prosperity chain** in Utility pays for itself: +8% coins, +3% XP, +8% rarity coins.
- 🗑️ **Fodder bad gear.** Every unwanted piece is 500 coins back.
- 📦 **Free daily draws** add up. Don't forget them.
- 📈 **Higher ELO = richer opponents.** Climbing pays.

### Combat Tips

- **Speed wins turn order.** Acting first means you might kill before they swing.
- **Element advantage disables crits.** If you counter their element, crit gear is wasted — stack raw damage instead.
- **Evasion caps at 80%.** Don't over-invest beyond the ceiling.
- **Defense is only 55% effective.** Pure tanking loses to pure offense. Balance your stats.
- **Shields are bonus HP.** Red Tonic and Sacred Candles effectively increase your health pool.
- **Phoenix Feather steals games.** Surviving with 1 HP is enough if you kill them next turn.
- **Win streak caps at 10.** After 10 consecutive wins, you're at peak efficiency.

### Progression Roadmap

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Level 1–4    NPC fights → buy first gear
  Level 5–10   PvP begins → max draws → Prosperity
  Level 10–20  First consumables → skill tree → hunt IVs
  Level 20–30  Tier 3 gear → market → rainbow minting
  Level 30–40  Optimize build → ELO climb → tier 4
  Level 40–50  Endgame consumables → perfect IVs → tier 5
  Level 50–70  Endgame consumables → leaderboard → Solar Cauldron
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Passive Abilities Reference

Passives come from skill tree nodes. They trigger on specific combat events.

### Trigger Events

| Trigger | Fires When... |
|:--------|:--------------|
| `onFightStart` | Battle begins (shields, initial buffs) |
| `onAttack` | You attack (damage bonuses, crit boosts) |
| `onDamageTaken` | You take damage (reductions, reflects, counters) |
| `onDamageDealt` | After you deal damage (extra strikes, amp) |
| `onWin` | You win (bonus XP, coins) |
| `onLose` | You lose |

### Action Types

| Action | Effect |
|:-------|:-------|
| `addFlatDamage` | +N flat damage per attack |
| `scaleDamagePct` | +N% damage |
| `scaleBySpeedPct` | Add N% of Speed as flat damage |
| `bonusCritChancePct` | +N% crit chance |
| `reduceIncomingDamagePct` | −N% damage taken (divisor) |
| `reduceIncomingDamageFlat` | −N flat damage taken |
| `applyShield` | Gain N HP shield |
| `healFlat` | Restore N HP |
| `rewardBonusPct` | +N% XP or coins from wins |
| `rarityCoinBonusPct` | +N% rarity coin bonus |
| `reflectFlatDamage` | Reflect N damage back |
| `counterDamagePct` | Counter for N% of damage taken |
| `addEvasionPct` | +N% evasion |
| `grantTempGuard` | Temporary +N Guard for X turns |
| `cancelCritical` | Nullify N critical hits |
| `reduceElementEffectivenessPct` | Dampen enemy element advantage by N% |
| `extraStrikePct` | N% chance for extra hit |
| `trueDamage` | +N true damage per attack |

### Priority System

When two passives share the same action:
1. Higher-tier gear wins
2. Same tier → higher magnitude wins
3. Same magnitude → most recently equipped wins

### Conditional Triggers

Passives can have conditions. Examples:

- `attack.turn == 1` — first attack only
- `attack.isFirstActor == true` — only when acting first in a turn
- `defender.hpPct > 70` — target above 70% HP
- `self.hpPct < 40` — self below 40% HP
- `attack.critical == true` — only on critical hits
- `attack.elementEffective == "super-effective"` — only with element advantage

---

## Quick Formula Cheat Sheet

```
┌─────────────────────────────────────────────────────┐
│  MAX HP                                             │
│  maxHp = max(30, (hpBase + G×2.2 + (P+S)×0.35)     │
│           × (1 + hpPct%/100))                       │
├─────────────────────────────────────────────────────┤
│  ATTACK ROLL                                        │
│  atkRoll = P×1.8 + S×0.7 + rarityPwr×0.2            │
│             + random(-6, 12)                        │
├─────────────────────────────────────────────────────┤
│  DEFENSE ROLL                                       │
│  defRoll = G×1.6 + S×0.35 + rarityPwr×0.2 + rand(-4,8) │
├─────────────────────────────────────────────────────┤
│  RAW DAMAGE                                         │
│  dmg = max(1, atkRoll - defRoll×0.55)                │
│  dmg += flatBonus  →  dmg ×= (1 + pctBonus/100)    │
├─────────────────────────────────────────────────────┤
│  CRITICAL HIT                                       │
│  chance = max(5%, 5% + bonus%/100), cap 95%         │
│  critDmg = dmg × (1.0 + critDmgPct/100)             │
│  ⚠ Disabled during super-effective elements         │
├─────────────────────────────────────────────────────┤
│  DEFENSE REDUCTION                                  │
│  dmg = dmg / (1 + defRedPct/100) - flatRed           │
├─────────────────────────────────────────────────────┤
│  ELEMENT MULTIPLIER                                 │
│  Super-effective: dmg × (1.5 + EH×0.02) [min 1.5×] │
│  Not-very-effective: dmg × 0.5                      │
├─────────────────────────────────────────────────────┤
│  EVASION                                            │
│  chance = 4% + defS×0.2% - atkS×0.1% + flat%       │
│  Range: 2% to 80%                                   │
├─────────────────────────────────────────────────────┤
│  XP TO LEVEL                                        │
│  xpNeeded = 80 + 40 × level²                        │
├─────────────────────────────────────────────────────┤
│  WIN XP                                             │
│  baseXp = 10 + oppLvl×2.5 + roundsWon×2             │
│            + min(streak, 10)                         │
│  × speedMultiplier(1–3) × (1 + xpBoost%/100)       │
├─────────────────────────────────────────────────────┤
│  WIN COINS                                          │
│  base = 18 + oppLvl×3 + yourCardRarityBonus        │
│  yourCardRarityBonus: C=0, R=3, SR=7, SSR=12, UR=18 │
├─────────────────────────────────────────────────────┤
│  ELO                                                │
│  expected = 1 / (1 + 10^(diff/400))                  │
│  delta = K × (1 - expected)                          │
│  K: 48 (0–9 fights), 24 (10–59), 16 (60+)           │
├─────────────────────────────────────────────────────┤
│  TURN ORDER                                         │
│  yourSpeed + random(0,8) vs oppSpeed + random(0,8) │
├─────────────────────────────────────────────────────┤
│  LEVEL UP (per level)                               │
│  +8 HP, +2 P, +2 G, +1 S, +1 EH                    │
├─────────────────────────────────────────────────────┤
│  IV → STAT CONVERSION                               │
│  HP: floor(guardIV / 2)                              │
│  P/G/S/EH: floor(iv / 3) each                       │
└─────────────────────────────────────────────────────┘
```

---

*This guide covers the Arena system as of June 2026. Mechanics may evolve over time — check the in-game Arena Updates panel for the latest changes, patch notes, and balance adjustments.*

*Good luck out there, and may your IV rolls be perfect. 🍀*
