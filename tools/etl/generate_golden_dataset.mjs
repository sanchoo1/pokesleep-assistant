import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const SUBSKILL_UNLOCK_LEVELS = [10, 25, 50, 70, 80];
const MAX_POKEMON_LEVEL = 70;

console.log('[Validator] Bundling Neroli\'s Lab reference oracle via esbuild...');
const bundlePath = path.join(__dirname, 'neroli_validator_bundle.cjs');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'neroli_validator_exporter.ts')],
  bundle: true,
  outfile: bundlePath,
  platform: 'node',
  format: 'cjs',
});

const require = createRequire(import.meta.url);
const { getNeroliValidationOracle } = require(bundlePath);
const oracle = getNeroliValidationOracle();

// Clean up temporary bundle immediately after loading
if (fs.existsSync(bundlePath)) {
  fs.unlinkSync(bundlePath);
}

const {
  COMPLETE_POKEDEX,
  NATURES,
  SUBSKILLS,
  RP,
  CarrySizeUtils,
  berryPowerForLevel,
  calculateIngredientPercentage,
  calculateSkillPercentage,
  calculateSkillPercentageWithPityProc,
  calculateNrOfBerriesPerDrop,
  calculateHelpSpeedSubskills,
  calculateRibbonFrequency,
  invertNatureFrequency,
  MathUtils,
} = oracle;

// Deterministic Mulberry32 PRNG for reproducible random individuals
function createPrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findMon(name) {
  const m = COMPLETE_POKEDEX.find(p => p.name.toUpperCase() === name.toUpperCase());
  if (!m) throw new Error(`Unknown Neroli Pokemon: ${name}`);
  return m;
}

function findNature(name) {
  const n = NATURES.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!n) throw new Error(`Unknown Neroli Nature: ${name}`);
  return n;
}

function findSubskill(name) {
  const s = SUBSKILLS.find(
    x => x.name.toLowerCase() === name.toLowerCase() || x.shortName.toLowerCase() === name.toLowerCase()
  );
  if (!s) throw new Error(`Unknown Neroli Subskill: ${name}`);
  return s;
}

function resolveNeroliIngredients(mon, comboCode) {
  const code = (comboCode || 'AAA').toUpperCase();
  const idx = ch => Math.max(0, ch.charCodeAt(0) - 65);
  const s0 = mon.ingredient0[idx(code[0])] || mon.ingredient0[0];
  const valid30 = mon.ingredient30.filter(i => i.ingredient.name !== 'Locked');
  const valid60 = mon.ingredient60.filter(i => i.ingredient.name !== 'Locked');
  const s30 = valid30[idx(code[1] || 'A')] || valid30[0];
  const s60 = valid60[idx(code[2] || 'A')] || valid60[0];

  const list = [{ level: 0, ingredient: s0.ingredient, amount: s0.amount }];
  if (s30) list.push({ level: 30, ingredient: s30.ingredient, amount: s30.amount });
  if (s60) list.push({ level: 60, ingredient: s60.ingredient, amount: s60.amount });
  return list;
}

/**
 * Compute authoritative reference metrics using Neroli's Lab sleepapi-common + RaenonX equations.
 */
function buildGoldenCase(spec) {
  const mon = findMon(spec.pokemon);
  const level = Math.max(1, Math.min(MAX_POKEMON_LEVEL, spec.level));
  const nature = findNature(spec.nature || 'Bashful');
  const subskillObjs = (spec.subskills || []).slice(0, 5).map(s => (s ? findSubskill(s) : null));
  const ribbonLevel = spec.ribbonLevel ?? 0;
  const baseSkillLevel = spec.mainSkillLevel ?? 1;
  const goodCampTicket = Boolean(spec.goodCampTicket);
  const nrOfTeamHelpingBonus = spec.nrOfTeamHelpingBonus ?? 0;
  const isFavoredBerry = Boolean(spec.isFavoredBerry);
  const mapBonus = spec.mapBonus ?? 0;
  const energyMultiplier = spec.energyMultiplier ?? 0.45;

  // Subskills unlocked at current game milestones [10, 25, 50, 70, 80]
  const neroliSubskillEntries = [];
  const activeSubskillSet = new Set();
  const activeSubskillNames = [];

  subskillObjs.forEach((sub, idx) => {
    if (!sub) return;
    const unlockLvl = SUBSKILL_UNLOCK_LEVELS[idx];
    neroliSubskillEntries.push({ level: unlockLvl, subskill: sub });
    if (level >= unlockLvl) {
      activeSubskillSet.add(sub.name);
      activeSubskillNames.push(sub.name);
    }
  });

  // Skill Level Up S (+1) and M (+2) from unlocked subskills
  let skillLevelUpBonus = 0;
  if (activeSubskillSet.has('Skill Level Up S')) skillLevelUpBonus += 1;
  if (activeSubskillSet.has('Skill Level Up M')) skillLevelUpBonus += 2;
  const maxSkillLevel = mon.skill.maxLevel || mon.skill.RP.length || 6;
  const effectiveMainSkillLevel = Math.max(1, Math.min(maxSkillLevel, baseSkillLevel + skillLevelUpBonus));

  // Ingredients resolved via combo code
  const neroliIngredients = resolveNeroliIngredients(mon, spec.ingredientCombo || 'AAA');
  const unlockedIngredients = neroliIngredients.filter(x => x.level <= level);

  // 1. Exact Neroli RP (`new RP(...)`)
  const rpInstance = new RP({
    pokemon: mon,
    name: mon.name,
    level,
    ribbon: ribbonLevel,
    nature,
    skillLevel: effectiveMainSkillLevel,
    subskills: neroliSubskillEntries,
    ingredients: neroliIngredients,
    externalId: spec.id,
    version: 1,
    saved: false,
    shiny: false,
    gender: undefined,
    sneakySnacking: false,
  });

  const expectedRp = rpInstance.calc();
  const rpBreakdown = {
    helpFactor: MathUtils.round(rpInstance.helpFactor, 4),
    miscFactor: rpInstance.miscFactor,
    ingredientFactor: rpInstance.ingredientFactor,
    berryFactor: rpInstance.berryFactor,
    skillFactor: rpInstance.skillFactor,
  };

  // 2. Exact Neroli Carry Size
  const baseWithEvolutions = CarrySizeUtils.baseCarrySize(mon);
  const expectedCarryLimit = CarrySizeUtils.calculateCarrySize({
    baseWithEvolutions,
    subskillsLevelLimited: activeSubskillSet,
    ribbon: ribbonLevel,
    camp: goodCampTicket,
  });

  // 3. Exact Neroli Ingredient Rate, Skill Rate (raw & pity), Berries Per Drop, Berry Power
  const expectedIngredientRate = calculateIngredientPercentage({
    pokemon: mon,
    nature,
    subskills: activeSubskillSet,
  });
  const expectedSkillRateWithoutPity = calculateSkillPercentage(
    mon.skillPercentage,
    activeSubskillSet,
    nature
  );
  const expectedSkillRateWithPity = calculateSkillPercentageWithPityProc(
    mon,
    activeSubskillSet,
    nature
  );
  const expectedBerriesPerDrop = calculateNrOfBerriesPerDrop(mon, activeSubskillSet);
  const baseBerryStrength = berryPowerForLevel(mon.berry, level);
  const finalBerryStrength = Math.ceil(
    baseBerryStrength * (1 + mapBonus / 100) * (isFavoredBerry ? 2.0 : 1.0)
  );

  // 4. Helping Frequency:
  // (a) RaenonX / In-Game formula: F = floor(F_B * floorWithIEEE754Correction(M, 4))
  const levelFactor = 1 - 0.002 * (level - 1);
  const natureFreq = invertNatureFrequency(nature);
  const subskillSpeed = calculateHelpSpeedSubskills({
    subskills: activeSubskillSet,
    nrOfTeamHelpingBonus,
  });
  const ribbonFreq = calculateRibbonFrequency(mon, ribbonLevel);
  const campFactor = goodCampTicket ? 0.8 : 1.0;
  const combinedM = MathUtils.floorWithIEEE754Correction(
    levelFactor * natureFreq * subskillSpeed * ribbonFreq * campFactor * energyMultiplier,
    4
  );
  const expectedHelpingFrequency = Math.floor(mon.frequency * combinedM);

  // (b) Neroli help-calculator before energy (for cross-source comparison at energy=1.0)
  const neroliBaseHelpSpeed = Math.floor(
    (MathUtils.round(natureFreq * subskillSpeed * levelFactor * ribbonFreq, 4) * mon.frequency) /
      (goodCampTicket ? 1.2 : 1.0)
  );

  // 5. Daily expected outputs under L1 steady-state model
  const dailyHelps = 86400 / expectedHelpingFrequency;
  const berryRate = 1 - expectedIngredientRate;
  const expectedDailyBerryCount = dailyHelps * berryRate * expectedBerriesPerDrop;
  const expectedDailyBerryEnergy = expectedDailyBerryCount * finalBerryStrength;

  const slotWeight = 1 / unlockedIngredients.length;
  let expectedDailyIngredientCount = 0;
  let expectedDailyIngredientEnergy = 0;
  for (const slot of unlockedIngredients) {
    const amt = dailyHelps * expectedIngredientRate * slotWeight * slot.amount;
    expectedDailyIngredientCount += amt;
    expectedDailyIngredientEnergy += amt * slot.ingredient.value * (1 + mapBonus / 100);
  }

  const expectedDailySkillProcs = dailyHelps * expectedSkillRateWithPity;

  // Primary quantized skill output per proc from Neroli skill activations
  let expectedPerProcOutput = 0;
  const actEntries = Object.entries(mon.skill.activations || {}).filter(([k]) => {
    if ((k === 'low' || k === 'high') && mon.skill.activations.mean) return false;
    if (k === 'paired' && mon.skill.activations.solo) return false;
    if (k === 'pairedHelps' && mon.skill.activations.soloHelps) return false;
    return true;
  });

  if (actEntries.length > 0) {
    const [firstKey, firstAct] = actEntries[0];
    const selfVal =
      firstKey === 'teamBerries'
        ? 0
        : typeof firstAct.amount === 'function'
          ? firstAct.amount({ skillLevel: effectiveMainSkillLevel, extra: 1 })
          : 0;
    const teamEachVal =
      firstKey === 'teamBerries'
        ? firstAct.amount({ skillLevel: effectiveMainSkillLevel, extra: 1 })
        : typeof firstAct.teamAmount === 'function'
          ? firstAct.teamAmount({ skillLevel: effectiveMainSkillLevel })
          : 0;
    expectedPerProcOutput =
      firstAct.unit === 'berries' && teamEachVal > 0 ? selfVal + 4 * teamEachVal : selfVal;
  }

  return {
    id: spec.id,
    description: spec.description,
    category: spec.category,
    input: {
      pokemon: mon.name,
      specialty: mon.specialty,
      level,
      nature: nature.name,
      subskills: subskillObjs.map(s => (s ? s.name : null)),
      ingredientCombo: (spec.ingredientCombo || 'AAA').toUpperCase(),
      mainSkillLevel: baseSkillLevel,
      ribbonLevel,
      goodCampTicket,
      nrOfTeamHelpingBonus,
      isFavoredBerry,
      mapBonus,
      energyMultiplier,
    },
    expected: {
      activeSubskillNames,
      skillLevelUpBonus,
      effectiveMainSkillLevel,
      rp: expectedRp,
      rpBreakdown,
      carryLimit: expectedCarryLimit,
      helpingFrequency: expectedHelpingFrequency,
      neroliBaseHelpSpeed,
      ingredientRate: MathUtils.round(expectedIngredientRate, 8),
      skillRateWithoutPity: MathUtils.round(expectedSkillRateWithoutPity, 8),
      skillRateWithPity: MathUtils.round(expectedSkillRateWithPity, 8),
      berriesPerDrop: expectedBerriesPerDrop,
      baseBerryStrength,
      finalBerryStrength,
      dailyHelps: MathUtils.round(dailyHelps, 6),
      dailyBerryCount: MathUtils.round(expectedDailyBerryCount, 4),
      dailyBerryEnergy: MathUtils.round(expectedDailyBerryEnergy, 2),
      dailyIngredientCount: MathUtils.round(expectedDailyIngredientCount, 4),
      dailyIngredientEnergy: MathUtils.round(expectedDailyIngredientEnergy, 2),
      dailySkillProcs: MathUtils.round(expectedDailySkillProcs, 6),
      perProcSkillOutput: expectedPerProcOutput,
    },
  };
}

// Group A & B: 14 Curated Real-Game Screenshot, Neroli RP Suite & Archetype Edge Cases
const curatedSpecs = [
  {
    id: 'real_sceptile_lv41_ocr',
    category: 'screenshot_verified',
    description: 'In-game screenshot Lv.41 Sceptile (SP=2119, Carry=33, Berry Burst Lv.3, Egg+Coffee)',
    pokemon: 'SCEPTILE',
    level: 41,
    nature: 'Relaxed',
    subskills: ['Skill Trigger M', 'Inventory Up S', 'Berry Finding S', 'Helping Bonus', 'Helping Speed S'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 3,
    ribbonLevel: 0,
  },
  {
    id: 'real_pinsir_lv50_rp',
    category: 'neroli_rp_verified',
    description: 'Neroli RP suite Lv.50 Pinsir (SP=2904, SLUS@70 & SLUM@80 still locked at Lv.50)',
    pokemon: 'PINSIR',
    level: 50,
    nature: 'Quiet',
    subskills: ['Ingredient Finder M', 'Ingredient Finder S', 'Dream Shard Bonus', 'Skill Level Up S', 'Skill Level Up M'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 1,
    ribbonLevel: 0,
  },
  {
    id: 'real_pinsir_lv70_sub4_unlock',
    category: 'lv70_cap_verified',
    description: 'Same Pinsir at Lv.70 max cap: unlocks 4th subskill (Skill Level Up S -> Lv.2), 5th (Lv.80) stays locked',
    pokemon: 'PINSIR',
    level: 70,
    nature: 'Quiet',
    subskills: ['Ingredient Finder M', 'Ingredient Finder S', 'Dream Shard Bonus', 'Skill Level Up S', 'Skill Level Up M'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 1,
    ribbonLevel: 0,
  },
  {
    id: 'real_espeon_lv60_rp',
    category: 'neroli_rp_verified',
    description: 'Neroli RP suite Lv.60 Espeon (SP=5698, Charge Strength M Lv.7, BFS+STM+STS)',
    pokemon: 'ESPEON',
    level: 60,
    nature: 'Jolly',
    subskills: ['Berry Finding S', 'Skill Trigger M', 'Skill Trigger S', null, null],
    ingredientCombo: 'ABA',
    mainSkillLevel: 7,
    ribbonLevel: 0,
  },
  {
    id: 'real_pupitar_lv33_ribbon2',
    category: 'neroli_rp_verified',
    description: 'Neroli RP suite Lv.33 Pupitar with 500h Ribbon Lv.2 (SP=1350, -5% freq, +3 carry)',
    pokemon: 'PUPITAR',
    level: 33,
    nature: 'Mild',
    subskills: ['Helping Bonus', 'Skill Trigger S', null, null, null],
    ingredientCombo: 'ABC',
    mainSkillLevel: 2,
    ribbonLevel: 2,
  },
  {
    id: 'real_eevee_lv55_ribbon4',
    category: 'ribbon_unevolved',
    description: 'Lv.55 Eevee with 2000h Ribbon Lv.4 (1 remaining evo: -12% freq, +8 carry)',
    pokemon: 'EEVEE',
    level: 55,
    nature: 'Sassy',
    subskills: ['Skill Trigger M', 'Berry Finding S', 'Helping Bonus', 'Helping Speed M', 'Inventory Up L'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 5,
    ribbonLevel: 4,
  },
  {
    id: 'real_pichu_lv30_ribbon4_two_evos',
    category: 'ribbon_unevolved',
    description: 'Lv.30 Pichu with 2000h Ribbon Lv.4 (2 remaining evos: -25% ribbon freq, +8 carry)',
    pokemon: 'PICHU',
    level: 30,
    nature: 'Adamant',
    subskills: ['Berry Finding S', 'Helping Speed M', 'Helping Speed S', null, null],
    ingredientCombo: 'AA',
    mainSkillLevel: 1,
    ribbonLevel: 4,
  },
  {
    id: 'spec_skill_gardevoir_lv70_e4e',
    category: 'specialty_skill',
    description: 'Lv.70 Gardevoir E4E healer: base Lv.4 + SLUM@70 -> effective Lv.6 (18.1 team energy/proc)',
    pokemon: 'GARDEVOIR',
    level: 70,
    nature: 'Calm',
    subskills: ['Skill Trigger M', 'Skill Trigger S', 'Helping Speed M', 'Skill Level Up M', 'Ingredient Finder S'],
    ingredientCombo: 'ABC',
    mainSkillLevel: 4,
    isFavoredBerry: true,
    mapBonus: 60,
  },
  {
    id: 'spec_skill_golduck_lv50_range',
    category: 'specialty_skill',
    description: 'Lv.50 Golduck Charge Strength S Variable Range (verifies mean=[500..4015] without triple-counting low/high)',
    pokemon: 'GOLDUCK',
    level: 50,
    nature: 'Sassy',
    subskills: ['Skill Trigger M', 'Skill Trigger S', 'Skill Level Up M', 'Helping Speed M', 'Berry Finding S'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 5,
    mapBonus: 50,
  },
  {
    id: 'spec_skill_dedenne_lv50_tasty',
    category: 'specialty_skill',
    description: 'Lv.50 Dedenne Tasty Chance S: base Lv.4 + SLUM -> Lv.6 (10% crit chance/proc)',
    pokemon: 'DEDENNE',
    level: 50,
    nature: 'Careful',
    subskills: ['Skill Trigger M', 'Skill Level Up M', 'Helping Speed M', 'Berry Finding S', 'Inventory Up L'],
    ingredientCombo: 'ABB',
    mainSkillLevel: 4,
  },
  {
    id: 'spec_skill_magnezone_lv60_pot_clamp',
    category: 'specialty_skill',
    description: 'Lv.60 Magnezone Cooking Power-Up S: base Lv.6 + SLUS + SLUM clamped at maxLevel=7 (31 pot/proc)',
    pokemon: 'MAGNEZONE',
    level: 60,
    nature: 'Gentle',
    subskills: ['Skill Trigger M', 'Skill Level Up M', 'Skill Level Up S', 'Helping Speed M', 'Skill Trigger S'],
    ingredientCombo: 'ABB',
    mainSkillLevel: 6,
  },
  {
    id: 'spec_skill_cresselia_lv60_lunar',
    category: 'specialty_skill',
    description: 'Lv.60 Cresselia Lunar Blessing (multi-activation: team energy + selfBerries + teamBerries)',
    pokemon: 'CRESSELIA',
    level: 60,
    nature: 'Calm',
    subskills: ['Skill Trigger M', 'Berry Finding S', 'Helping Bonus', 'Helping Speed M', 'Skill Trigger S'],
    ingredientCombo: 'ABA',
    mainSkillLevel: 6,
    isFavoredBerry: true,
    mapBonus: 60,
  },
  {
    id: 'spec_berry_raichu_lv70_speedcap',
    category: 'specialty_berry',
    description: 'Lv.70 Raichu hitting 35% subskill speed cap (HSM+HSS+5xHB -> 0.65 floor) + GCT + Favored 2x',
    pokemon: 'RAICHU',
    level: 70,
    nature: 'Adamant',
    subskills: ['Berry Finding S', 'Helping Bonus', 'Helping Speed M', 'Helping Speed S', 'Inventory Up L'],
    ingredientCombo: 'AAA',
    mainSkillLevel: 3,
    nrOfTeamHelpingBonus: 4,
    goodCampTicket: true,
    isFavoredBerry: true,
    mapBonus: 75,
  },
  {
    id: 'spec_ing_dragonite_lv60_abc',
    category: 'specialty_ingredient',
    description: 'Lv.60 Dragonite ABC (Herb+Corn+Oil) with IFM+IFS+HSM+INVL',
    pokemon: 'DRAGONITE',
    level: 60,
    nature: 'Quiet',
    subskills: ['Ingredient Finder M', 'Ingredient Finder S', 'Helping Speed M', 'Inventory Up L', 'Berry Finding S'],
    ingredientCombo: 'ABC',
    mainSkillLevel: 3,
    mapBonus: 60,
  },
];

// Group C: 16 Deterministic Seeded Random Individuals across all specialties & levels 5..70
const rng = createPrng(20261107);
const candidatePool = COMPLETE_POKEDEX.filter(
  p => p.ingredient0?.length > 0 && p.ingredient30?.some(i => i.ingredient.name !== 'Locked')
);

function pickRandom(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function sampleFiveSubskills() {
  const copy = [...SUBSKILLS];
  const chosen = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(rng() * copy.length);
    chosen.push(copy.splice(idx, 1)[0].name);
  }
  return chosen;
}

const randomLevels = [8, 12, 22, 25, 30, 35, 42, 50, 54, 60, 63, 68, 70, 70, 48, 70];
const randomSpecs = randomLevels.map((lvl, idx) => {
  const mon = pickRandom(candidatePool);
  const nat = pickRandom(NATURES);
  const subs = sampleFiveSubskills();
  const valid30 = mon.ingredient30.filter(i => i.ingredient.name !== 'Locked');
  const valid60 = mon.ingredient60.filter(i => i.ingredient.name !== 'Locked');
  const l30 = String.fromCharCode(65 + Math.floor(rng() * Math.max(1, valid30.length)));
  const l60 = String.fromCharCode(65 + Math.floor(rng() * Math.max(1, valid60.length)));
  const maxSk = mon.skill.maxLevel || 6;
  const baseSk = 1 + Math.floor(rng() * maxSk);
  const ribbon = Math.floor(rng() * 5);
  const camp = rng() < 0.25;
  const favored = rng() < 0.4;
  const mapBonus = [0, 15, 35, 50, 60, 75][Math.floor(rng() * 6)];

  return {
    id: `rand_seed_${String(idx + 1).padStart(2, '0')}_${mon.name.toLowerCase()}_lv${lvl}`,
    category: 'seeded_random',
    description: `Seeded random #${idx + 1}: Lv.${lvl} ${mon.displayName} (${mon.specialty}, ${nat.name}, A${l30}${l60})`,
    pokemon: mon.name,
    level: lvl,
    nature: nat.name,
    subskills: subs,
    ingredientCombo: `A${l30}${l60}`,
    mainSkillLevel: baseSk,
    ribbonLevel: ribbon,
    goodCampTicket: camp,
    nrOfTeamHelpingBonus: Math.floor(rng() * 3),
    isFavoredBerry: favored,
    mapBonus,
  };
});

const allSpecs = [...curatedSpecs, ...randomSpecs];
const goldenDataset = {
  schemaVersion: '1.0.0',
  generatedBy: 'tools/etl/generate_golden_dataset.mjs',
  referenceSources: [
    "Neroli's Lab (sleepapi-common RP, CarrySizeUtils, stat-utils, berry-utils, mainskills)",
    'RaenonX Pokémon Sleep Wiki (F = floor(F_B * rounddown(M, 4)), Pity Proc & Specialty formulas)',
    'In-game verified OCR screenshot (Lv.41 Sceptile SP=2119, Carry=33)',
  ],
  gameRules: {
    subskillUnlockLevels: SUBSKILL_UNLOCK_LEVELS,
    maxPokemonLevel: MAX_POKEMON_LEVEL,
  },
  count: allSpecs.length,
  cases: allSpecs.map(buildGoldenCase),
};

const outDir = path.join(ROOT_DIR, 'packages/engine/src/__tests__/fixtures');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'golden-cross-validation.json');
fs.writeFileSync(outPath, JSON.stringify(goldenDataset, null, 2) + '\n', 'utf-8');

console.log(`[Validator] Successfully generated ${goldenDataset.count} golden cross-validation cases -> ${outPath}`);

