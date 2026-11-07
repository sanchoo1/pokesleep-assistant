import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('[ETL] Starting Pokémon Sleep data extraction pipeline...');

// 1. Bundle and load nerolis-lab data
const bundlePath = path.join(__dirname, 'neroli_bundle.cjs');
console.log('[ETL] Bundling nerolis-lab typescript modules...');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'neroli_exporter.ts')],
  bundle: true,
  outfile: bundlePath,
  platform: 'node',
  format: 'cjs',
});

// Load the bundled commonJS module
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { getRawNeroliData } = require(bundlePath);
const neroliData = getRawNeroliData();
console.log(`[ETL] Neroli data loaded: ${neroliData.pokemon.length} Pokémon, ${neroliData.berries.length} berries, ${neroliData.ingredients.length} ingredients, ${neroliData.recipes.length} recipes.`);

// 2. Parse PokéAPI CSVs
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }
    rows.push(obj);
  }
  return rows;
}

console.log('[ETL] Parsing PokéAPI multilingual CSVs...');
// Species names: local_language_id -> 12: zh-CN, 4: zh-TW, 11: ja, 9: en
const pokeapiSpeciesNamesRaw = parseCsv(path.join(ROOT_DIR, '.cache/pokeapi/pokemon_species_names.csv'));
const pokeapiSpeciesNames = new Map();
for (const row of pokeapiSpeciesNamesRaw) {
  const sid = parseInt(row.pokemon_species_id, 10);
  const lid = parseInt(row.local_language_id, 10);
  if (!pokeapiSpeciesNames.has(sid)) {
    pokeapiSpeciesNames.set(sid, {});
  }
  const entry = pokeapiSpeciesNames.get(sid);
  if (lid === 12) entry['zh-CN'] = row.name;
  else if (lid === 4) entry['zh-TW'] = row.name;
  else if (lid === 11) entry['ja'] = row.name;
  else if (lid === 9) entry['en'] = row.name;
}

// Nature names: local_language_id -> 12: zh-CN, 4: zh-TW, 11: ja, 9: en
const pokeapiNaturesRaw = parseCsv(path.join(ROOT_DIR, '.cache/pokeapi/natures.csv'));
const pokeapiNatureNamesRaw = parseCsv(path.join(ROOT_DIR, '.cache/pokeapi/nature_names.csv'));
const natureIdToIdentifier = new Map();
for (const row of pokeapiNaturesRaw) {
  natureIdToIdentifier.set(parseInt(row.id, 10), row.identifier.toLowerCase());
}
const pokeapiNatureNames = new Map();
for (const row of pokeapiNatureNamesRaw) {
  const nid = parseInt(row.nature_id, 10);
  const lid = parseInt(row.local_language_id, 10);
  const identifier = natureIdToIdentifier.get(nid);
  if (!identifier) continue;
  if (!pokeapiNatureNames.has(identifier)) {
    pokeapiNatureNames.set(identifier, {});
  }
  const entry = pokeapiNatureNames.get(identifier);
  if (lid === 12) entry['zh-CN'] = row.name;
  else if (lid === 4) entry['zh-TW'] = row.name;
  else if (lid === 11) entry['ja'] = row.name;
  else if (lid === 9) entry['en'] = row.name;
}

// Berry names from items:
const pokeapiItemsRaw = parseCsv(path.join(ROOT_DIR, '.cache/pokeapi/item_names.csv'));
const pokeapiBerriesRaw = parseCsv(path.join(ROOT_DIR, '.cache/pokeapi/berries.csv'));
const itemNames = new Map();
for (const row of pokeapiItemsRaw) {
  const iid = parseInt(row.item_id, 10);
  const lid = parseInt(row.local_language_id, 10);
  if (!itemNames.has(iid)) itemNames.set(iid, {});
  const entry = itemNames.get(iid);
  if (lid === 12) entry['zh-CN'] = row.name;
  else if (lid === 4) entry['zh-TW'] = row.name;
  else if (lid === 11) entry['ja'] = row.name;
  else if (lid === 9) entry['en'] = row.name;
}
const pokeapiBerryNames = new Map();
for (const row of pokeapiBerriesRaw) {
  const iid = parseInt(row.item_id, 10);
  const item = itemNames.get(iid);
  if (item && item.en) {
    const key = item.en.replace(' Berry', '').toUpperCase();
    pokeapiBerryNames.set(key, item);
  }
}

// 3. Load proprietary / curated YAML data sources
console.log('[ETL] Loading curated Sleep YAML data sources...');
const sleepLocales = yaml.parse(fs.readFileSync(path.join(ROOT_DIR, 'data-sources/sleep_locales.yaml'), 'utf-8'));
const probabilities = yaml.parse(fs.readFileSync(path.join(ROOT_DIR, 'data-sources/probabilities.yaml'), 'utf-8'));
const levelCurve = yaml.parse(fs.readFileSync(path.join(ROOT_DIR, 'data-sources/level_curve.yaml'), 'utf-8'));

// 4. Form / Variant suffix localization helper
const formSuffixes = {
  HOLIDAY: { 'zh-CN': '（节日）', 'zh-TW': '（節日）', ja: ' (ホリデー)', en: ' (Holiday)' },
  HALLOWEEN: { 'zh-CN': '（万圣节）', 'zh-TW': '（萬聖節）', ja: ' (ハロウィン)', en: ' (Halloween)' },
  CAPTAIN: { 'zh-CN': '（船长）', 'zh-TW': '（船長）', ja: ' (キャプテン)', en: ' (Captain)' },
  ALOLAN: { 'zh-CN': '（阿罗拉的样子）', 'zh-TW': '（阿羅拉的樣子）', ja: ' (アローラのすがた)', en: ' (Alolan Form)' },
  PALDEAN: { 'zh-CN': '（帕底亚的样子）', 'zh-TW': '（帕底亞的樣子）', ja: ' (パルデアのすがた)', en: ' (Paldean Form)' },
  AMPED: { 'zh-CN': '（高调的样子）', 'zh-TW': '（高調的樣子）', ja: ' (ハイなすがた)', en: ' (Amped Form)' },
  LOW_KEY: { 'zh-CN': '（低调的样子）', 'zh-TW': '（低調的樣子）', ja: ' (ローなすがた)', en: ' (Low Key Form)' },
  SMALL: { 'zh-CN': '（小尺寸）', 'zh-TW': '（小尺寸）', ja: ' (ちいさいサイズ)', en: ' (Small Variety)' },
  MEDIUM: { 'zh-CN': '（普通尺寸）', 'zh-TW': '（普通尺寸）', ja: ' (ふつうのサイズ)', en: ' (Medium Variety)' },
  LARGE: { 'zh-CN': '（大尺寸）', 'zh-TW': '（大尺寸）', ja: ' (おおきいサイズ)', en: ' (Large Variety)' },
  JUMBO: { 'zh-CN': '（特大尺寸）', 'zh-TW': '（特大尺寸）', ja: ' (とくだいサイズ)', en: ' (Jumbo Variety)' },
};

function getPokemonTranslations(mon) {
  const base = pokeapiSpeciesNames.get(mon.pokedexNumber) || {
    'zh-CN': mon.displayName,
    'zh-TW': mon.displayName,
    ja: mon.displayName,
    en: mon.displayName,
  };

  let matchedSuffix = null;
  for (const [key, suffix] of Object.entries(formSuffixes)) {
    if (mon.name.endsWith(`_${key}`) || mon.name.includes(`_${key}_`)) {
      matchedSuffix = suffix;
      break;
    }
  }

  if (matchedSuffix) {
    return {
      'zh-CN': `${base['zh-CN']}${matchedSuffix['zh-CN']}`,
      'zh-TW': `${base['zh-TW']}${matchedSuffix['zh-TW']}`,
      ja: `${base['ja']}${matchedSuffix['ja']}`,
      en: `${base['en']}${matchedSuffix['en']}`,
    };
  }

  return {
    'zh-CN': base['zh-CN'],
    'zh-TW': base['zh-TW'],
    ja: base['ja'],
    en: base['en'] || mon.displayName,
  };
}

// 5. Build transformed game-data structure
console.log('[ETL] Transforming and cross-referencing entities...');

const pokemonList = neroliData.pokemon.map(mon => {
  const translations = getPokemonTranslations(mon);

  const skillInfo = {
    name: mon.skill.name,
    modifierName: mon.skill.modifierName || null,
    baseSkillName: mon.skill.baseSkill ? mon.skill.baseSkill.name : mon.skill.name,
    maxLevel: mon.skill.maxLevel || (mon.skill.RP ? mon.skill.RP.length : 6),
    RP: mon.skill.RP || [],
    strengthAmounts: mon.skill.strengthAmounts || [],
    image: mon.skill.image || '',
  };

  return {
    name: mon.name,
    displayName: mon.displayName,
    pokedexNumber: mon.pokedexNumber,
    specialty: mon.specialty,
    frequency: mon.frequency,
    ingredientPercentage: mon.ingredientPercentage,
    skillPercentage: mon.skillPercentage,
    berry: mon.berry.name,
    carrySize: mon.carrySize,
    previousEvolutions: mon.previousEvolutions,
    remainingEvolutions: mon.remainingEvolutions,
    evolvesFrom: mon.evolvesFrom || null,
    evolvesInto: mon.evolvesInto || [],
    ingredient0: (mon.ingredient0 || []).map(slot => ({
      ingredient: slot.ingredient.name,
      amount: slot.amount,
    })),
    ingredient30: (mon.ingredient30 || []).map(slot => ({
      ingredient: slot.ingredient.name,
      amount: slot.amount,
    })),
    ingredient60: (mon.ingredient60 || []).map(slot => ({
      ingredient: slot.ingredient.name,
      amount: slot.amount,
    })),
    skill: skillInfo,
    pityProcThreshold: mon.pityProcThreshold,
    shinyLocked: Boolean(mon.shinyLocked),
    translations,
  };
});

// Berries
const berries = neroliData.berries.map(b => {
  const trans = pokeapiBerryNames.get(b.name) || {
    'zh-CN': b.name,
    'zh-TW': b.name,
    ja: b.name,
    en: b.name,
  };
  return {
    name: b.name,
    type: b.type,
    value: b.value,
    translations: {
      'zh-CN': trans['zh-CN'],
      'zh-TW': trans['zh-TW'],
      ja: trans['ja'],
      en: trans['en'] || b.name,
    },
  };
});

// Ingredients
const ingredients = neroliData.ingredients.map(ing => {
  const conf = sleepLocales.ingredients[ing.name] || {};
  return {
    name: ing.name,
    longName: ing.longName,
    value: ing.value,
    taxedValue: ing.taxedValue,
    translations: {
      'zh-CN': conf['zh-CN'] || ing.longName,
      'zh-TW': conf['zh-TW'] || ing.longName,
      ja: conf['ja'] || ing.longName,
      en: conf['en'] || ing.longName,
    },
    aliases: conf.aliases || [],
  };
});

// Recipes
const recipes = neroliData.recipes.map(r => {
  const conf = sleepLocales.recipes[r.name] || {};
  return {
    name: r.name,
    displayName: r.displayName,
    type: r.type,
    value: r.value,
    valueMax: r.valueMax,
    bonus: r.bonus,
    nrOfIngredients: r.nrOfIngredients,
    ingredients: r.ingredients.map(is => ({
      ingredient: is.ingredient.name,
      amount: is.amount,
    })),
    translations: {
      'zh-CN': conf['zh-CN'] || r.displayName,
      'zh-TW': conf['zh-TW'] || r.displayName,
      ja: conf['ja'] || r.displayName,
      en: conf['en'] || r.displayName,
    },
    aliases: conf.aliases || [],
  };
});

// Natures
const natures = neroliData.natures.map(n => {
  const identifier = n.name.toLowerCase();
  const trans = pokeapiNatureNames.get(identifier) || {
    'zh-CN': n.name,
    'zh-TW': n.name,
    ja: n.name,
    en: n.name,
  };
  return {
    name: n.name,
    positiveModifier: n.positiveModifier,
    negativeModifier: n.negativeModifier,
    modifiers: {
      frequency: n.frequency,
      ingredient: n.ingredient,
      skill: n.skill,
      energy: n.energy,
      exp: n.exp,
    },
    translations: {
      'zh-CN': trans['zh-CN'] || n.name,
      'zh-TW': trans['zh-TW'] || n.name,
      ja: trans['ja'] || n.name,
      en: trans['en'] || n.name,
    },
  };
});

// Subskills
const subskills = neroliData.subskills.map(s => {
  const conf = sleepLocales.subskills[s.name] || {};
  return {
    name: s.name,
    shortName: s.shortName,
    rarity: s.rarity,
    amount: s.amount,
    translations: {
      'zh-CN': conf['zh-CN'] || s.name,
      'zh-TW': conf['zh-TW'] || s.name,
      ja: conf['ja'] || s.name,
      en: conf['en'] || s.name,
    },
    aliases: conf.aliases || [],
  };
});

// Islands
const islands = neroliData.islands.map(isle => {
  const conf = sleepLocales.islands[isle.shortName] || {};
  return {
    name: isle.name,
    shortName: isle.shortName,
    berries: isle.berries.map(b => b.name),
    rankThresholds: isle.rankThresholds || [],
    translations: {
      'zh-CN': conf['zh-CN'] || isle.name,
      'zh-TW': conf['zh-TW'] || isle.name,
      ja: conf['ja'] || isle.name,
      en: conf['en'] || isle.name,
    },
    aliases: conf.aliases || [],
  };
});

// Ribbon rules
const ribbonRules = {
  frequencyBonus: {
    level2: { evolutions1: 0.05, evolutions2: 0.11 },
    level4: { evolutions1: 0.07, evolutions2: 0.14 },
  },
  carrySizeBonus: {
    1: 1,
    2: 3,
    3: 6,
    4: 8,
    level1: 1,
    level2: 3,
    level3: 6,
    level4: 8,
  },
};

// Full GameData Object
const gameData = {
  metadata: {
    version: '1.0.0',
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    attribution: {
      nerolisLab: 'Apache License 2.0 (Copyright The Neroli\'s Lab Authors)',
      pokeapi: 'BSD 3-Clause License (Copyright PokéAPI)',
      raenonxAndMathcord: 'Research contributions by RaenonX and Mathcord Community',
      licenseDoc: 'ATTRIBUTION.md',
    },
  },
  pokemon: pokemonList,
  berries,
  ingredients,
  recipes,
  recipeLevelBonus: neroliData.recipeLevelBonus,
  natures,
  subskills,
  islands,
  constants: {
    ...neroliData.constants,
    ribbonRules,
  },
  probabilities,
  levelCurve,
};

// 6. Build Individual Language Packs
console.log('[ETL] Generating language packs (zh-CN, zh-TW, ja, en)...');
const languages = ['zh-CN', 'zh-TW', 'ja', 'en'];
const languagePacks = {};

for (const lang of languages) {
  const pack = {
    lang,
    terms: {
      specialty: {
        berry: sleepLocales.terms?.specialty?.berry?.[lang] || 'Berries',
        ingredient: sleepLocales.terms?.specialty?.ingredient?.[lang] || 'Ingredients',
        skill: sleepLocales.terms?.specialty?.skill?.[lang] || 'Skills',
        all: sleepLocales.terms?.specialty?.all?.[lang] || 'All',
      },
      recipe_types: {
        curry: sleepLocales.terms?.recipe_types?.curry?.[lang] || 'Curries',
        salad: sleepLocales.terms?.recipe_types?.salad?.[lang] || 'Salads',
        dessert: sleepLocales.terms?.recipe_types?.dessert?.[lang] || 'Desserts',
      },
    },
    pokemon: {},
    berries: {},
    ingredients: {},
    recipes: {},
    natures: {},
    subskills: {},
    islands: {},
    mainskills: {},
    aliases: {},
  };

  // Populate pokemon
  for (const mon of pokemonList) {
    pack.pokemon[mon.name] = mon.translations[lang];
  }
  // Berries
  for (const b of berries) {
    pack.berries[b.name] = b.translations[lang];
  }
  // Ingredients
  for (const ing of ingredients) {
    pack.ingredients[ing.name] = ing.translations[lang];
    if (ing.aliases) {
      for (const al of ing.aliases) {
        pack.aliases[al.toLowerCase()] = { type: 'ingredient', key: ing.name };
      }
    }
  }
  // Recipes
  for (const r of recipes) {
    pack.recipes[r.name] = r.translations[lang];
  }
  // Natures
  for (const n of natures) {
    pack.natures[n.name] = n.translations[lang];
  }
  // Subskills
  for (const s of subskills) {
    pack.subskills[s.name] = s.translations[lang];
    if (s.aliases) {
      for (const al of s.aliases) {
        pack.aliases[al.toLowerCase()] = { type: 'subskill', key: s.name };
      }
    }
  }
  // Islands
  for (const i of islands) {
    pack.islands[i.shortName] = i.translations[lang];
  }
  // Main skills
  for (const [skillKey, skillVal] of Object.entries(sleepLocales.mainskills || {})) {
    pack.mainskills[skillKey] = skillVal[lang] || skillKey;
    if (skillVal.aliases) {
      for (const al of skillVal.aliases) {
        pack.aliases[al.toLowerCase()] = { type: 'mainskill', key: skillKey };
      }
    }
  }

  languagePacks[lang] = pack;
}

// 7. Write files to packages/data/src/generated
const outDir = path.join(ROOT_DIR, 'packages/data/src/generated');
const localesOutDir = path.join(outDir, 'locales');
fs.mkdirSync(localesOutDir, { recursive: true });

console.log(`[ETL] Writing ${path.join(outDir, 'game-data.json')}...`);
fs.writeFileSync(path.join(outDir, 'game-data.json'), JSON.stringify(gameData, null, 2), 'utf-8');

for (const [lang, pack] of Object.entries(languagePacks)) {
  const filePath = path.join(localesOutDir, `${lang}.json`);
  console.log(`[ETL] Writing ${filePath}...`);
  fs.writeFileSync(filePath, JSON.stringify(pack, null, 2), 'utf-8');
}

console.log('[ETL] Pipeline completed successfully!');

// Clean up temporary bundle
if (fs.existsSync(bundlePath)) {
  fs.unlinkSync(bundlePath);
}
