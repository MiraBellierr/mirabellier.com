const EMPTY_STATS = Object.freeze({
  hp: 0,
  power: 0,
  guard: 0,
  speed: 0,
  effectHit: 0,
});

const BRANCHES = [
  {
    id: "offense",
    name: "Offense",
    color: "#ef4444",
    chains: [
      {
        id: "might",
        name: "Might",
        nodes: [2, 3, 4, 5, 7].map((value, index) => ({
          name: `Might ${index + 1}`,
          description: `Permanently gain ${value} Power.`,
          statBonus: { power: value },
        })),
      },
      {
        id: "swiftness",
        name: "Swiftness",
        nodes: [1, 1, 2, 2, 3].map((value, index) => ({
          name: `Swiftness ${index + 1}`,
          description: `Permanently gain ${value} Speed.`,
          statBonus: { speed: value },
        })),
      },
      {
        id: "fury",
        name: "Fury",
        nodes: [
          {
            name: "Heavy Hand",
            description: "Deal 2 additional damage with every attack.",
            passive: {
              trigger: "onAttack",
              priority: 20,
              actions: [{ type: "addFlatDamage", value: 2 }],
            },
          },
          {
            name: "Keen Edge",
            description: "Gain 3% critical-hit chance.",
            passive: {
              trigger: "onAttack",
              priority: 20,
              actions: [{ type: "bonusCritChancePct", value: 3 }],
            },
          },
          {
            name: "Momentum",
            description: "Add 8% of Speed as flat attack damage.",
            passive: {
              trigger: "onAttack",
              priority: 20,
              actions: [{ type: "scaleBySpeedPct", value: 8 }],
            },
          },
          {
            name: "Battle Heat",
            description: "Deal 4% more attack damage.",
            passive: {
              trigger: "onAttack",
              priority: 20,
              actions: [{ type: "scaleDamagePct", value: 4 }],
            },
          },
          {
            name: "Relentless",
            description:
              "Once per fight, each attack has an 8% chance to strike again for 35% damage.",
            passive: {
              trigger: "onAttack",
              priority: 21,
              actions: [
                {
                  type: "extraStrikePct",
                  value: 35,
                  chancePct: 8,
                  maxTriggersPerFight: 1,
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "defense",
    name: "Defense",
    color: "#3b82f6",
    chains: [
      {
        id: "vitality",
        name: "Vitality",
        nodes: [8, 10, 14, 18, 25].map((value, index) => ({
          name: `Vitality ${index + 1}`,
          description: `Permanently gain ${value} HP.`,
          statBonus: { hp: value },
        })),
      },
      {
        id: "bulwark",
        name: "Bulwark",
        nodes: [1, 2, 3, 4, 5].map((value, index) => ({
          name: `Bulwark ${index + 1}`,
          description: `Permanently gain ${value} Guard.`,
          statBonus: { guard: value },
        })),
      },
      {
        id: "resolve",
        name: "Resolve",
        nodes: [
          {
            name: "Preparation",
            description: "Begin every fight with a 6-point shield.",
            passive: {
              trigger: "onFightStart",
              priority: 20,
              actions: [{ type: "applyShield", value: 6 }],
            },
          },
          {
            name: "Steady Guard",
            description: "Reduce incoming damage by 1.",
            passive: {
              trigger: "onDamageTaken",
              priority: 20,
              actions: [{ type: "reduceIncomingDamageFlat", value: 1 }],
            },
          },
          {
            name: "Second Wind",
            description:
              "When damaged, gain a 10% chance to heal 3 HP, up to twice per fight.",
            passive: {
              trigger: "onDamageTaken",
              priority: 20,
              actions: [
                {
                  type: "healFlat",
                  value: 3,
                  chancePct: 10,
                  maxTriggersPerFight: 2,
                },
              ],
            },
          },
          {
            name: "Critical Ward",
            description: "Cancel the first critical hit received each fight.",
            passive: {
              trigger: "onFightStart",
              priority: 21,
              actions: [{ type: "cancelCritical", value: 1 }],
            },
          },
          {
            name: "Iron Resolve",
            description: "Reduce incoming damage by 5%.",
            passive: {
              trigger: "onDamageTaken",
              priority: 22,
              actions: [{ type: "reduceIncomingDamagePct", value: 5 }],
            },
          },
        ],
      },
    ],
  },
  {
    id: "utility",
    name: "Utility",
    color: "#a855f7",
    chains: [
      {
        id: "fortune",
        name: "Fortune",
        nodes: [1, 1, 2, 2, 3].map((value, index) => ({
          name: `Fortune ${index + 1}`,
          description: `Permanently gain ${value} Effect Hit.`,
          statBonus: { effectHit: value },
        })),
      },
      {
        id: "adaptation",
        name: "Adaptation",
        nodes: [
          { name: "Endure", description: "Permanently gain 5 HP.", statBonus: { hp: 5 } },
          { name: "Brace", description: "Permanently gain 2 Guard.", statBonus: { guard: 2 } },
          { name: "Flow", description: "Permanently gain 2 Speed.", statBonus: { speed: 2 } },
          { name: "Improvise", description: "Permanently gain 3 Power.", statBonus: { power: 3 } },
          { name: "Mastery", description: "Permanently gain 3 Effect Hit.", statBonus: { effectHit: 3 } },
        ],
      },
      {
        id: "prosperity",
        name: "Prosperity",
        nodes: [
          {
            name: "Coin Sense",
            description: "Earn 3% more coins from victories.",
            passive: {
              trigger: "onWin",
              priority: 20,
              actions: [{ type: "rewardBonusPct", target: "coins", value: 3 }],
            },
          },
          {
            name: "Quick Study",
            description: "Earn 3% more XP from victories.",
            passive: {
              trigger: "onWin",
              priority: 20,
              actions: [{ type: "rewardBonusPct", target: "xp", value: 3 }],
            },
          },
          {
            name: "Light Step",
            description: "Gain 2% evasion chance.",
            passive: {
              trigger: "onFightStart",
              priority: 20,
              actions: [{ type: "addEvasionPct", value: 2 }],
            },
          },
          {
            name: "Treasure Hunter",
            description: "Increase rarity-based coin rewards by 8%.",
            passive: {
              trigger: "onWin",
              priority: 20,
              actions: [{ type: "rarityCoinBonusPct", value: 8 }],
            },
          },
          {
            name: "Abundance",
            description: "Earn 5% more XP and coins from victories.",
            passive: {
              trigger: "onWin",
              priority: 21,
              actions: [
                { type: "rewardBonusPct", target: "xp", value: 5 },
                { type: "rewardBonusPct", target: "coins", value: 5 },
              ],
            },
          },
        ],
      },
    ],
  },
];

const SKILL_TREE_NODES = BRANCHES.flatMap((branch, branchIndex) =>
  branch.chains.flatMap((chain, chainIndex) =>
    chain.nodes.map((node, tierIndex) => {
      const id = `${branch.id}_${chain.id}_${tierIndex + 1}`;
      return {
        id,
        branch: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        chain: chain.id,
        chainName: chain.name,
        tier: tierIndex + 1,
        name: node.name,
        description: node.description,
        prerequisiteId:
          tierIndex > 0
            ? `${branch.id}_${chain.id}_${tierIndex}`
            : null,
        statBonus: { ...EMPTY_STATS, ...(node.statBonus || {}) },
        passive: node.passive
          ? {
              key: `skill:${id}`,
              ...node.passive,
              when: Array.isArray(node.passive.when) ? node.passive.when : [],
            }
          : null,
        position: {
          x: 130 + branchIndex * 720 + chainIndex * 190,
          y: 120 + tierIndex * 170,
        },
      };
    }),
  ),
);

const SKILL_TREE_NODES_BY_ID = new Map(
  SKILL_TREE_NODES.map((node) => [node.id, node]),
);

function computeSkillBonuses(nodeIds) {
  const stats = { ...EMPTY_STATS };
  const passives = [];

  nodeIds.forEach((nodeId) => {
    const node = SKILL_TREE_NODES_BY_ID.get(nodeId);
    if (!node) return;
    Object.keys(stats).forEach((key) => {
      stats[key] += Number(node.statBonus?.[key] || 0);
    });
    if (node.passive) {
      passives.push({
        ...node.passive,
        source: {
          type: "skill",
          nodeId: node.id,
          nodeName: node.name,
          branch: node.branch,
        },
      });
    }
  });

  return { stats, passives };
}

module.exports = {
  SKILL_TREE_BRANCHES: BRANCHES.map(({ id, name, color }) => ({ id, name, color })),
  SKILL_TREE_NODES,
  SKILL_TREE_NODES_BY_ID,
  computeSkillBonuses,
};
