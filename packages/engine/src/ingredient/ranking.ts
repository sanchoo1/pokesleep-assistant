import {
  GAME_DATA,
  PokemonSpecies,
  Nature,
  Subskill,
} from '@pokesleep/data';
import { calculateDailyProduction } from '../production';

export interface IngredientRankingFilters {
  targetIngredient: string; // e.g. 'Mushroom', 'Apple', 'Herb', 'Milk'
  level?: number; // default 60
  onlyFinalEvolution?: boolean; // default false
  onlyAAA?: boolean; // default false
  preset?: 'optimal' | 'neutral'; // default 'optimal'
  currentPokemon?: {
    pokemonName: string;
    level: number;
    nature?: Nature | string | null;
    subskills?: Array<Subskill | string>;
    ingredients?: { slotA: string; slotB?: string; slotC?: string };
    ribbonLevel?: number;
    mewLearnedSkill?: string;
  };
}

export interface IngredientRankingEntry {
  pokemon: PokemonSpecies;
  comboCode: string; // 'AAA', 'ABB', 'AAC', etc.
  slotIngredients: string[];
  level: number;
  dailyTargetYield: number; // Daily yield of target ingredient
  dailyTotalYield: number; // Total daily ingredients across all types
  targetRatio: number; // Percentage of target ingredient (0 to 100)
  isFinalEvolution: boolean;
  isCurrentPokemon: boolean;
  subskillSummary: string; // e.g. '极品食材流 (IFM+IFS+HB)' or '当前个体配置'
  relativePercentage: number; // Relative to #1 rank (100 for top)
}

export interface IngredientRankingResult {
  targetIngredient: string;
  targetIngredientObj?: (typeof GAME_DATA.ingredients)[number];
  level: number;
  maxYield: number;
  entries: IngredientRankingEntry[];
}

const OPTIMAL_INGREDIENT_SUBSKILLS: string[] = [
  'Helping Bonus',
  'Ingredient Finder M',
  'Helping Speed M',
  'Ingredient Finder S',
  'Inventory Up L',
];

const OPTIMAL_NATURE_NAME = 'Quiet'; // +Ingredient, -EXP

/**
 * Calculates the exact daily yield of a specific target ingredient for a Pokémon
 */
export function getSpecificIngredientYield(
  prod: ReturnType<typeof calculateDailyProduction>,
  targetIngredient: string
): { dailyYield: number; totalYield: number; ratio: number } {
  const targetLower = targetIngredient.toLowerCase();
  const allIngredients = prod.combinedDailyIngredients || prod.dailyIngredients || [];
  const found = allIngredients.find((i) => i.ingredient.toLowerCase() === targetLower);
  const dailyYield = found?.amount || 0;
  const totalYield = prod.combinedDailyIngredientCount || prod.dailyIngredientCount || 0;
  const ratio = totalYield > 0 ? (dailyYield / totalYield) * 100 : 0;
  return { dailyYield, totalYield, ratio };
}

/**
 * Generates valid ingredient combos for a species that produce targetIngredient at given level
 */
function getValidCombosForTarget(
  mon: PokemonSpecies,
  level: number,
  targetLower: string
): Array<{ comboCode: string; slotIngredients: string[] }> {
  const slot0List = (mon.ingredient0 || []).filter((i) => i.ingredient !== 'Locked');
  const slot30List = (mon.ingredient30 || []).filter((i) => i.ingredient !== 'Locked');
  const slot60List = (mon.ingredient60 || []).filter((i) => i.ingredient !== 'Locked');

  const combos: Array<{ comboCode: string; slotIngredients: string[] }> = [];

  for (let idx0 = 0; idx0 < slot0List.length; idx0++) {
    const ing0 = slot0List[idx0].ingredient;
    const letter0 = String.fromCharCode(65 + idx0);

    if (level < 30 || slot30List.length === 0) {
      if (ing0.toLowerCase() === targetLower) {
        combos.push({ comboCode: letter0, slotIngredients: [ing0] });
      }
      continue;
    }

    for (let idx30 = 0; idx30 < slot30List.length; idx30++) {
      const ing30 = slot30List[idx30].ingredient;
      const letter30 = String.fromCharCode(65 + idx30);

      if (level < 60 || slot60List.length === 0) {
        if (ing0.toLowerCase() === targetLower || ing30.toLowerCase() === targetLower) {
          combos.push({
            comboCode: `${letter0}${letter30}`,
            slotIngredients: [ing0, ing30],
          });
        }
        continue;
      }

      for (let idx60 = 0; idx60 < slot60List.length; idx60++) {
        const ing60 = slot60List[idx60].ingredient;
        const letter60 = String.fromCharCode(65 + idx60);

        if (
          ing0.toLowerCase() === targetLower ||
          ing30.toLowerCase() === targetLower ||
          ing60.toLowerCase() === targetLower
        ) {
          combos.push({
            comboCode: `${letter0}${letter30}${letter60}`,
            slotIngredients: [ing0, ing30, ing60],
          });
        }
      }
    }
  }

  // Deduplicate by slotIngredients combo
  const uniqueMap = new Map<string, { comboCode: string; slotIngredients: string[] }>();
  for (const c of combos) {
    const key = c.slotIngredients.join('|');
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, c);
    }
  }

  return Array.from(uniqueMap.values());
}

/**
 * Ranks all Pokémon capable of producing targetIngredient across different combos,
 * subskill presets, and evolution stages.
 */
export function rankIngredientProducers(
  filters: IngredientRankingFilters
): IngredientRankingResult {
  const {
    targetIngredient,
    level = 60,
    onlyFinalEvolution = false,
    onlyAAA = false,
    preset = 'optimal',
    currentPokemon,
  } = filters;

  const targetLower = targetIngredient.toLowerCase();
  const targetObj = GAME_DATA.ingredients.find(
    (i) => i.name.toLowerCase() === targetLower
  );

  const rawEntries: IngredientRankingEntry[] = [];

  // 1. Iterate across all Pokémon species that can produce targetIngredient
  for (const mon of GAME_DATA.pokemon) {
    if (onlyFinalEvolution && mon.remainingEvolutions > 0) {
      continue;
    }

    // Check if mon can produce targetIngredient anywhere in its pools
    const hasIn0 = (mon.ingredient0 || []).some((i) => i.ingredient.toLowerCase() === targetLower);
    const hasIn30 = (mon.ingredient30 || []).some((i) => i.ingredient.toLowerCase() === targetLower);
    const hasIn60 = (mon.ingredient60 || []).some((i) => i.ingredient.toLowerCase() === targetLower);

    if (!hasIn0 && !hasIn30 && !hasIn60) {
      continue;
    }

    const validCombos = getValidCombosForTarget(mon, level, targetLower);

    for (const combo of validCombos) {
      // Check onlyAAA constraint (every unlocked slot must be targetIngredient)
      if (onlyAAA && !combo.slotIngredients.every((ing) => ing.toLowerCase() === targetLower)) {
        continue;
      }

      const isOpt = preset === 'optimal';
      const subskills = isOpt ? OPTIMAL_INGREDIENT_SUBSKILLS : [];
      const nature = isOpt ? OPTIMAL_NATURE_NAME : null;

      try {
        const prod = calculateDailyProduction({
          pokemon: mon,
          level,
          nature,
          subskills,
          ingredientSelection: {
            slot0: combo.slotIngredients[0],
            slot30: combo.slotIngredients[1],
            slot60: combo.slotIngredients[2],
          },
          mainSkillLevel: 1 + (mon.previousEvolutions || 0),
          isFavoredBerry: false,
          helpingBonusMode: 'individual25',
        });

        const { dailyYield, totalYield, ratio } = getSpecificIngredientYield(prod, targetIngredient);

        if (dailyYield > 0.1) {
          rawEntries.push({
            pokemon: mon,
            comboCode: combo.comboCode,
            slotIngredients: combo.slotIngredients,
            level,
            dailyTargetYield: Math.round(dailyYield * 10) / 10,
            dailyTotalYield: Math.round(totalYield * 10) / 10,
            targetRatio: Math.round(ratio * 10) / 10,
            isFinalEvolution: mon.remainingEvolutions === 0,
            isCurrentPokemon: false,
            subskillSummary: isOpt ? '极品食材流 (IFM+IFS+HB)' : '基础白板配置',
            relativePercentage: 100,
          });
        }
      } catch {
        // Skip unprocessable combos
      }
    }
  }

  // 2. If currentPokemon provided, evaluate its actual yield
  if (currentPokemon && currentPokemon.ingredients) {
    try {
      const mon = GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === currentPokemon.pokemonName.toUpperCase()
      );
      if (mon) {
        const prod = calculateDailyProduction({
          pokemon: mon,
          level: currentPokemon.level,
          nature: currentPokemon.nature,
          subskills: currentPokemon.subskills || [],
          ingredientSelection: {
            slot0: currentPokemon.ingredients.slotA,
            slot30: currentPokemon.ingredients.slotB,
            slot60: currentPokemon.ingredients.slotC,
          },
          ribbonLevel: currentPokemon.ribbonLevel || 0,
          mewLearnedSkill: currentPokemon.mewLearnedSkill,
          helpingBonusMode: 'individual25',
        });

        const { dailyYield, totalYield, ratio } = getSpecificIngredientYield(prod, targetIngredient);

        if (dailyYield > 0.05) {
          const slots = [
            currentPokemon.ingredients.slotA,
            currentPokemon.ingredients.slotB,
            currentPokemon.ingredients.slotC,
          ].filter((s): s is string => Boolean(s) && s !== 'Locked');

          rawEntries.push({
            pokemon: mon,
            comboCode: 'CUSTOM',
            slotIngredients: slots,
            level: currentPokemon.level,
            dailyTargetYield: Math.round(dailyYield * 10) / 10,
            dailyTotalYield: Math.round(totalYield * 10) / 10,
            targetRatio: Math.round(ratio * 10) / 10,
            isFinalEvolution: mon.remainingEvolutions === 0,
            isCurrentPokemon: true,
            subskillSummary: `当前个体 (Lv.${currentPokemon.level})`,
            relativePercentage: 100,
          });
        }
      }
    } catch {
      // Ignore evaluation error
    }
  }

  // 3. Sort descending by dailyTargetYield
  rawEntries.sort((a, b) => {
    // If yields are equal, prioritize current Pokémon or higher purity
    if (Math.abs(b.dailyTargetYield - a.dailyTargetYield) > 0.05) {
      return b.dailyTargetYield - a.dailyTargetYield;
    }
    return b.targetRatio - a.targetRatio;
  });

  const maxYield = rawEntries[0]?.dailyTargetYield || 1;

  for (const entry of rawEntries) {
    entry.relativePercentage = Math.max(1, Math.round((entry.dailyTargetYield / maxYield) * 100));
  }

  return {
    targetIngredient,
    targetIngredientObj: targetObj,
    level,
    maxYield,
    entries: rawEntries,
  };
}
