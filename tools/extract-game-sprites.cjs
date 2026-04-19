const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_SIZE = 32;
const SOURCE_PATH = path.join(process.cwd(), 'src', 'assets', 'game.png');
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'assets', 'sprites');
const INDEX_PATH = path.join(OUTPUT_DIR, 'index.json');

const NAME_GRID = {
  0: [
    'skull_face',
    'green_slime_blob',
    'dark_portal_ring',
    'speech_bubble',
    'bat_wings',
    'gold_sparkles',
    'pink_heart',
    'sleep_zzz',
    'yellow_lightning',
    'burning_face',
    'water_droplets',
  ],
  1: [
    'bloody_hand',
    'red_lungs',
    'stomach_organ',
    'pink_brain',
    'flexed_bicep',
  ],
  2: [
    'green_arrow_up',
    'red_arrow_down',
    'green_arrow_up_right',
    'red_arrow_down_right',
    'green_arrow_u_turn',
    'red_arrow_u_turn',
    'blue_refresh_arrows',
  ],
  3: [
    'blood_dagger',
    'holy_axe',
    'crossed_swords',
    'white_magic_staff',
    'twin_daggers',
    'thorn_staff',
    'fist_hit',
    'short_sword',
    'blue_kite_shield',
    'fire_ring',
    'poison_skull',
    'red_impact_burst',
    'moon_sickle',
    'shadow_step',
    'purple_portal',
    'yellow_sunburst',
  ],
  4: [
    'speech_bubble_outline',
    'double_speech_bubbles',
    'campfire',
    'camp_tent',
    'dark_bird',
    'crossbow',
    'ballista',
    'spellbook',
    'crossed_maces',
  ],
  5: [
    'bronze_sword',
    'iron_sword',
    'steel_sword',
    'dark_sword',
    'golden_rapier',
    'curved_saber',
    'azure_blade',
    'crimson_blade',
    'obsidian_blade',
    'greatsword',
    'battle_axe',
    'runic_chakram',
    'ghost_scythe',
    'bone_club',
    'shadow_swirl',
    'fist_punch',
  ],
  6: [
    'round_shield',
    'tower_shield',
    'kite_shield',
    'dual_hatchets',
    'short_crossbow',
    'boomerang',
    'wooden_crook',
    'teal_dagger',
    'red_dagger',
    'green_dagger',
    'gold_dagger',
    'dark_dagger',
  ],
  7: [
    'green_shoe',
    'iron_helmet',
    'demon_helmet',
    'silver_helmet',
    'gray_helmet',
    'blue_helmet',
    'brown_armor',
    'dark_armor',
    'blue_tunic',
    'green_tunic',
    'red_trousers',
    'leather_boots',
    'heart_boxers',
    'blue_dress',
    'purple_robe',
    'dark_belt',
  ],
  8: [
    'brown_boot',
    'gray_boot',
    'red_boots',
    'black_boots',
    'gold_ring',
    'blue_ring',
    'gold_necklace',
    'crimson_coil_charm',
    'white_wing_charm',
    'brown_pouch',
  ],
  9: [
    'red_potion_small',
    'blue_potion_small',
    'green_potion_small',
    'amber_potion_small',
    'red_elixir_small',
    'cyan_elixir_small',
    'lime_elixir_small',
    'orange_elixir_small',
    'star_elixir_small',
    'sky_elixir_small',
    'olive_elixir_small',
    'honey_elixir_small',
    'red_flask',
    'orange_flask',
    'pink_flask',
    'white_bedroll',
  ],
  10: [
    'brown_bag',
    'battle_axe_tool',
    'pickaxe',
    'hammer',
    'war_hammer',
    'dark_mace',
    'iron_dagger_tool',
    'torch',
    'magnifying_glass',
    'lantern',
    'small_axe',
    'candle_pair',
    'round_bomb',
    'shell',
    'feather_crown',
    'hourglass',
  ],
  11: [
    'raw_meat',
    'blue_magic_card',
    'dark_goggles',
    'gold_lyre',
    'violin',
    'blue_ocarina',
    'wooden_flute',
    'pan_flute',
    'lute',
    'silver_key',
    'ribbon_medal',
    'treasure_chest',
    'mortar_pestle',
    'green_herbs',
    'orange_leaf',
    'green_leaf',
  ],
  12: [
    'chicken_drumstick',
    'pink_flame',
    'dark_claws',
    'potted_plant',
    'small_plant',
    'potted_herb',
    'brown_herb',
    'gold_coin',
    'wood_logs',
    'silver_ingots',
    'gold_ingots',
    'coin_bag',
    'wooden_spoon',
    'brown_mushroom',
    'blue_crystal_shards',
    'red_gem',
  ],
  13: [
    'blue_book',
    'red_book',
    'green_book',
    'yellow_book',
    'brown_book',
    'tan_book',
    'navy_spellbook',
    'red_spellbook',
    'open_book',
    'envelope',
    'feather_quill',
    'parchment',
    'old_scroll',
    'white_dice',
    'playing_cards',
    'green_bottle',
  ],
  14: [
    'red_apple',
    'banana',
    'pear',
    'lemon_slice',
    'strawberry',
    'grapes',
    'carrot',
    'corn',
    'garlic',
    'tomato',
    'eggplant',
    'red_chili',
    'mushroom_cap',
    'bread_loaf',
    'croissant',
    'raw_pork',
  ],
  15: [
    'meat_drumstick',
    'steak_cut',
    'ham_bone',
    'sausage_link',
    'small_fish',
    'egg_cluster',
    'egg',
    'cheese_wedge',
    'milk_bottle',
    'purple_potion_bottle',
    'salt_pile',
    'purple_spice_pile',
    'pink_candy',
    'cake_slice',
    'coffee_cup',
  ],
  16: [
    'rusty_hook',
    'double_hook',
    'pink_worm',
    'blue_fish',
    'left_brown_boot',
    'right_dark_boot',
    'yellow_fish',
    'firecracker_bundle',
    'jellyfish',
    'red_insect',
    'green_beetle',
    'white_bones',
    'dark_bones',
    'stone_disc',
    'golden_chest',
  ],
  17: [
    'wood_log',
    'stone_block',
    'blue_crystal_cluster',
    'gold_bar',
    'diamond',
    'white_feather',
    'pink_feather',
    'yellow_paper',
    'dark_branch',
    'curved_bone',
    'silver_feather',
  ],
  18: [
    'red_orb',
    'blue_orb',
    'green_orb',
    'gold_orb',
    'purple_orb',
    'dark_orb',
  ],
  19: [
    'white_potion',
    'clear_potion',
    'rolled_scroll',
    'bandage_roll',
    'red_potion_large',
    'blue_potion_large',
    'green_potion_large',
    'yellow_potion_large',
    'purple_cauldron',
    'dark_cauldron',
    'dark_fur',
    'wood_plank',
  ],
  20: [
    'empty_sack',
    'brown_powder',
    'purple_powder',
    'tan_powder',
    'orange_powder',
    'red_powder',
    'blue_powder',
    'green_powder',
    'yellow_powder',
    'magenta_powder',
    'emerald_powder',
    'white_powder',
    'gray_powder',
  ],
  21: [
    'sparkle_wand',
    'wood_pickaxe',
    'bronze_pickaxe',
    'silver_pickaxe',
    'steel_pickaxe',
    'gold_pickaxe',
    'crown_banner',
    'sun_banner',
    'moon_banner',
    'blue_snowflake',
    'orange_burst',
    'blue_burst',
    'orange_star_burst',
    'icy_star_burst',
  ],
};

function isPngFile(name) {
  return name.toLowerCase().endsWith('.png');
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing source sprite sheet: ${SOURCE_PATH}`);
  }

  const { data, info } = await sharp(SOURCE_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cols = Math.floor(info.width / TILE_SIZE);
  const rows = Math.floor(info.height / TILE_SIZE);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const entry of fs.readdirSync(OUTPUT_DIR)) {
    if (isPngFile(entry) || entry === 'index.json') {
      fs.rmSync(path.join(OUTPUT_DIR, entry), { force: true });
    }
  }

  const usedNames = new Set();
  const extracted = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let alphaSum = 0;
      for (let y = 0; y < TILE_SIZE; y += 1) {
        const py = row * TILE_SIZE + y;
        for (let x = 0; x < TILE_SIZE; x += 1) {
          const px = col * TILE_SIZE + x;
          const idx = (py * info.width + px) * info.channels;
          alphaSum += data[idx + 3];
        }
      }

      if (alphaSum <= 0) continue;

      const rowNames = NAME_GRID[row] || [];
      const name = rowNames[col];
      if (!name) {
        throw new Error(`Missing name for tile r${row} c${col}`);
      }
      if (usedNames.has(name)) {
        throw new Error(`Duplicate sprite name detected: ${name}`);
      }
      usedNames.add(name);

      const filename = `${name}.png`;
      const outPath = path.join(OUTPUT_DIR, filename);
      await sharp(SOURCE_PATH)
        .extract({
          left: col * TILE_SIZE,
          top: row * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
        })
        .png()
        .toFile(outPath);

      extracted.push({
        name,
        file: `sprites/${filename}`,
        row,
        col,
        size: TILE_SIZE,
      });
    }
  }

  extracted.sort((a, b) => a.row - b.row || a.col - b.col);

  fs.writeFileSync(
    INDEX_PATH,
    `${JSON.stringify(
      {
        source: 'src/assets/game.png',
        tileSize: TILE_SIZE,
        total: extracted.length,
        sprites: extracted,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`Extracted ${extracted.length} sprites to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
