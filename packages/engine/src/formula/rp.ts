import {
  GAME_DATA,
  type PokemonSpecies,
  type Nature,
  type Subskill,
} from '@pokesleep/data';
import { floorWithIEEE754Correction, round } from './math';
import { calculateNatureSpeedFactor, calculateRibbonFrequencyFactor } from './helpingFrequency';
import { calculateIngredientRate } from './skillProc';

const RP_ING_GROWTH: Record<number, number> = {
  1: 1.0,
  2: 1.003,
  3: 1.007,
  4: 1.011,
  5: 1.016,
  6: 1.021,
  7: 1.027,
  8: 1.033,
  9: 1.039,
  10: 1.046,
  11: 1.053,
  12: 1.061,
  13: 1.069,
  14: 1.077,
  15: 1.085,
  16: 1.094,
  17: 1.104,
  18: 1.114,
  19: 1.124,
  20: 1.134,
  21: 1.145,
  22: 1.156,
  23: 1.168,
  24: 1.18,
  25: 1.192,
  26: 1.205,
  27: 1.218,
  28: 1.231,
  29: 1.245,
  30: 1.259,
  31: 1.274,
  32: 1.288,
  33: 1.303,
  34: 1.319,
  35: 1.335,
  36: 1.351,
  37: 1.368,
  38: 1.385,
  39: 1.402,
  40: 1.42,
  41: 1.439,
  42: 1.457,
  43: 1.477,
  44: 1.496,
  45: 1.517,
  46: 1.537,
  47: 1.558,
  48: 1.58,
  49: 1.602,
  50: 1.625,
  51: 1.648,
  52: 1.671,
  53: 1.696,
  54: 1.72,
  55: 1.745,
  56: 1.771,
  57: 1.798,
  58: 1.824,
  59: 1.852,
  60: 1.88,
  61: 1.927,
  62: 1.975,
  63: 2.024,
  64: 2.075,
  65: 2.127,
  66: 2.18,
  67: 2.235,
  68: 2.29,
  69: 2.348,
  70: 2.406,
};

const RP_MISC_SUBSKILL_BONUS: Record<string, number> = {
  'dream shard bonus': 0.221,
  'energy recovery bonus': 0.221,
  'helping bonus': 0.221,
  'research exp bonus': 0.221,
  'sleep exp bonus': 0.221,
  'inventory up s': 0.071,
  'inventory up m': 0.139,
  'inventory up l': 0.181,
};

export interface CalculateRPParams {
  pokemon: PokemonSpecies | string;
  level: number;
  skillLevel: number; // Effective displayed main skill level (1..maxLevel)
  nature?: Nature | string | null;
  activeSubskills?: Array<Subskill | string>;
  unlockedIngredients: Array<{ ingredient: string; amount: number }>;
  ribbonLevel?: number;
}

export interface RPBreakdown {
  rp: number;
  helpFactor: number;
  miscFactor: number;
  ingredientFactor: number;
  berryFactor: number;
  skillFactor: number;
}

/**
 * Exact in-game Research Power (RP / SP) calculator.
 * Matches official Pokémon Sleep & Neroli's Lab RP formula across levels 1–70.
 */
export function calculateRP(params: CalculateRPParams): RPBreakdown {
  const {
    pokemon: rawPokemon,
    level,
    skillLevel,
    nature: rawNature,
    activeSubskills = [],
    unlockedIngredients,
    ribbonLevel = 0,
  } = params;

  const mon =
    typeof rawPokemon === 'string'
      ? GAME_DATA.pokemon.find(
          p =>
            p.name.toUpperCase() === rawPokemon.toUpperCase() ||
            p.displayName.toLowerCase() === rawPokemon.toLowerCase() ||
            p.translations['zh-CN'] === rawPokemon ||
            p.translations['zh-TW'] === rawPokemon
        )
      : rawPokemon;

  if (!mon) {
    throw new Error(`Pokemon species not found: ${rawPokemon}`);
  }

  let nature: Nature | null = null;
  if (rawNature) {
    nature =
      typeof rawNature === 'string'
        ? GAME_DATA.natures.find(
            n =>
              n.name.toLowerCase() === rawNature.toLowerCase() ||
              n.translations['zh-CN'] === rawNature ||
              n.translations['zh-TW'] === rawNature
          ) || null
        : rawNature;
  }

  const subNames = new Set<string>();
  for (const s of activeSubskills) {
    if (typeof s === 'string') {
      const found = GAME_DATA.subskills.find(
        x =>
          x.name.toLowerCase() === s.toLowerCase() ||
          x.shortName.toLowerCase() === s.toLowerCase() ||
          x.translations['zh-CN'] === s ||
          x.translations['zh-TW'] === s
      );
      if (found) subNames.add(found.name.toLowerCase());
    } else if (s) {
      subNames.add(s.name.toLowerCase());
    }
  }

  // 1. Help factor (NOTE: Helping Bonus is in miscFactor, NOT frequencySubskills for RP)
  const lvl = Math.max(1, level);
  const levelFactor = 1 - 0.002 * (lvl - 1);
  const natureFreq = calculateNatureSpeedFactor(nature);
  const helpM = subNames.has('helping speed m') ? 0.14 : 0;
  const helpS = subNames.has('helping speed s') ? 0.07 : 0;
  const helpSpeedSubskills = Math.max(0.65, round(1 - helpM - helpS, 2));
  const ribbonFactor = calculateRibbonFrequencyFactor(ribbonLevel, mon.remainingEvolutions);

  const helpFactor =
    5 *
    floorWithIEEE754Correction(
      3600 /
        (mon.frequency *
          floorWithIEEE754Correction(levelFactor * natureFreq * helpSpeedSubskills * ribbonFactor, 4)),
      2
    );

  // 2. Ingredient & Skill chances (floored to 4 decimals)
  const rawIngRate = calculateIngredientRate({
    baseIngredientPercentage: mon.ingredientPercentage,
    nature,
    subskills: activeSubskills,
  });
  const ingredientChance = floorWithIEEE754Correction(rawIngRate, 4);

  const triggerM = subNames.has('skill trigger m') ? 0.36 : 0;
  const triggerS = subNames.has('skill trigger s') ? 0.18 : 0;
  const triggerSubMult = round(1 + triggerM + triggerS, 2);
  const natureSkillMult = nature?.modifiers?.skill ?? 1.0;
  const skillChance = floorWithIEEE754Correction(
    (mon.skillPercentage / 100) * triggerSubMult * natureSkillMult,
    4
  );

  // 3. Ingredient factor
  const ingredientGrowth =
    RP_ING_GROWTH[lvl] ??
    0.000000398 * Math.pow(lvl, 3) + 0.000159 * Math.pow(lvl, 2) + 0.00367 * lvl - 0.00609 + 1;

  const validSlots =
    unlockedIngredients.length > 0
      ? unlockedIngredients
      : [mon.ingredient0[0] || { ingredient: 'Apple', amount: 1 }];

  const totalIngVal = validSlots.reduce((sum, slot) => {
    const ingObj = GAME_DATA.ingredients.find(
      i => i.name.toLowerCase() === slot.ingredient.toLowerCase()
    );
    const val = ingObj ? ingObj.value : 100;
    return sum + slot.amount * val;
  }, 0);
  const ingredientsValue = Math.floor(totalIngVal / validSlots.length);

  const ingredientFactor = floorWithIEEE754Correction(
    helpFactor * ingredientChance * ingredientsValue * ingredientGrowth,
    2
  );

  // 4. Berry factor
  const isBerrySpec = mon.specialty === 'berry' || mon.specialty === 'all';
  const berriesPerDrop = (isBerrySpec ? 2 : 1) + (subNames.has('berry finding s') ? 1 : 0);
  const berryObj = GAME_DATA.berries.find(b => b.name.toUpperCase() === mon.berry.toUpperCase());
  const baseBerryVal = berryObj ? berryObj.value : 25;
  const berryValue =
    berriesPerDrop *
    Math.max(baseBerryVal + lvl - 1, Math.round(Math.pow(1.025, lvl - 1) * baseBerryVal));

  const berryFactor = floorWithIEEE754Correction(
    helpFactor * (1 - ingredientChance) * berryValue,
    2
  );

  // 5. Skill factor
  const clampedSkillLvl = Math.max(
    1,
    Math.min(skillLevel, mon.skill.maxLevel || mon.skill.RP.length || 6)
  );
  const skillRpValue = mon.skill.RP[clampedSkillLvl - 1] ?? mon.skill.RP[0] ?? 400;
  const skillFactor = floorWithIEEE754Correction(helpFactor * skillChance * skillRpValue, 2);

  // 6. Misc factor
  const natureEnergy = nature?.modifiers?.energy ?? 1.0;
  const convertedNatureEnergy = natureEnergy < 1 ? 0.92 : natureEnergy > 1 ? 1.08 : 1.0;
  let subskillMisc = 1;
  for (const name of subNames) {
    subskillMisc += RP_MISC_SUBSKILL_BONUS[name] ?? 0;
  }
  const miscFactor = floorWithIEEE754Correction(convertedNatureEnergy * subskillMisc, 2);

  const rp = Math.round(miscFactor * (ingredientFactor + berryFactor + skillFactor));

  return {
    rp,
    helpFactor,
    miscFactor,
    ingredientFactor,
    berryFactor,
    skillFactor,
  };
}

