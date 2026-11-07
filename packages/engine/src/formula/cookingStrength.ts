import { GAME_DATA } from '@pokesleep/data';
import { round } from './math';

export interface CookingStrengthParams {
  recipeName?: string; // e.g. "FANCY_APPLE_CURRY"
  recipeLevel?: number; // 1 to 70 (default 1)
  recipeIngredients?: Array<{ ingredient: string; amount: number; value?: number }>;
  recipeBonus?: number; // recipe bonus % (e.g. 18.7)
  fillerIngredients?: Array<{ ingredient: string; amount: number; value?: number }>;
  mapBonus?: number; // 0 to 85%
  eventMultiplier?: number; // default 1.0
  critMode?: 'normal' | 'weekday_crit' | 'sunday_crit' | 'weekly_average';
}

export interface CookingStrengthResult {
  recipeBaseStrength: number; // Recipe strength at Lv 1 before bonuses
  recipeStrengthAtLevel: number; // Recipe strength with recipeLevelBonus
  fillerStrength: number; // Filler ingredients base value sum
  subtotal: number; // Recipe + filler before map & crit
  mapMultiplier: number;
  critMultiplier: number;
  finalStrength: number;
}

/**
 * Calculates the cooking strength for a dish, including recipe level bonus,
 * filler ingredients, map island bonus, and crit multiplier.
 */
export function calculateCookingStrength(params: CookingStrengthParams): CookingStrengthResult {
  const {
    recipeName,
    recipeLevel = 1,
    recipeIngredients,
    recipeBonus,
    fillerIngredients = [],
    mapBonus = 0,
    eventMultiplier = 1.0,
    critMode = 'normal',
  } = params;

  let baseIngredients = recipeIngredients;
  let bonusPercent = recipeBonus;

  if (recipeName) {
    const found = GAME_DATA.recipes.find(r => r.name.toUpperCase() === recipeName.toUpperCase());
    if (found) {
      if (!baseIngredients) {
        baseIngredients = found.ingredients.map(ing => {
          const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === ing.ingredient.toLowerCase());
          return {
            ingredient: ing.ingredient,
            amount: ing.amount,
            value: ingObj ? ingObj.value : 0,
          };
        });
      }
      if (bonusPercent === undefined) {
        bonusPercent = found.bonus;
      }
    }
  }

  const bonus = bonusPercent ?? 0;
  const level = Math.min(70, Math.max(1, recipeLevel));
  const levelMultiplier = GAME_DATA.recipeLevelBonus[level] ?? 1.0;

  // 1. Calculate required ingredients total value
  let requiredIngredientsValue = 0;
  if (baseIngredients) {
    for (const item of baseIngredients) {
      let val = item.value;
      if (val === undefined) {
        const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === item.ingredient.toLowerCase());
        val = ingObj ? ingObj.value : 0;
      }
      requiredIngredientsValue += item.amount * val;
    }
  }

  // Base recipe strength at Lv 1: round(requiredIngredientsValue * (1 + bonus / 100))
  const recipeBaseStrength = round(requiredIngredientsValue * (1.0 + bonus / 100));

  // Recipe strength at the given level: round(requiredIngredientsValue * levelMultiplier * (1 + bonus / 100))
  const recipeStrengthAtLevel = round(requiredIngredientsValue * levelMultiplier * (1.0 + bonus / 100));

  // 2. Filler ingredients strength
  let fillerStrength = 0;
  for (const item of fillerIngredients) {
    let val = item.value;
    if (val === undefined) {
      const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === item.ingredient.toLowerCase());
      val = ingObj ? ingObj.value : 0;
    }
    fillerStrength += item.amount * val;
  }

  const subtotal = recipeStrengthAtLevel + fillerStrength;

  // 3. Map multiplier & event multiplier
  const mapMultiplier = 1.0 + Math.max(0, mapBonus) / 100;

  // 4. Crit multiplier
  let critMultiplier = 1.0;
  if (critMode === 'weekday_crit') critMultiplier = 2.0;
  else if (critMode === 'sunday_crit') critMultiplier = 3.0;
  else if (critMode === 'weekly_average') critMultiplier = 1.171428571;

  // 5. Final strength
  const finalStrength = Math.floor(subtotal * mapMultiplier * eventMultiplier * critMultiplier);

  return {
    recipeBaseStrength,
    recipeStrengthAtLevel,
    fillerStrength,
    subtotal,
    mapMultiplier,
    critMultiplier,
    finalStrength,
  };
}

