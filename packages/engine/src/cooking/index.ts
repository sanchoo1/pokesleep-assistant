import {
  GAME_DATA,
  type Recipe,
  type RecipeType,
  type Ingredient,
} from '@pokesleep/data';
import { calculateCookingStrength } from '../formula';
import { round } from '../formula/math';

export interface IngredientInventory {
  [ingredientName: string]: number;
}

export interface MissingIngredientDetail {
  ingredient: string;
  longName: string;
  required: number;
  available: number;
  missing: number;
}

export interface RecipeCoverageItem {
  recipe: Recipe;
  coverageByRecipe: number; // 0 to 100% (min single ingredient coverage, bottleneck metric)
  coverageByIngredient: number; // 0 to 100% (total covered items / total required items)
  canMake: boolean; // coverageByRecipe >= 100 && !potCapacityExceeded
  maxMealsPossible: number; // How many times this dish can be cooked with current inventory
  missingIngredients: MissingIngredientDetail[];
  potCapacityExceeded: boolean;
}

export interface MealCoverageParams {
  inventory: IngredientInventory;
  recipeType?: RecipeType | 'all';
  potCapacity?: number; // default 57
}

/**
 * Calculates meal coverage against all recipes or a specific meal type.
 */
export function calculateMealCoverage(params: MealCoverageParams): RecipeCoverageItem[] {
  const {
    inventory,
    recipeType = 'all',
    potCapacity = 57,
  } = params;

  // Normalize inventory keys to lowercase
  const invMap = new Map<string, number>();
  for (const [k, v] of Object.entries(inventory)) {
    invMap.set(k.toLowerCase(), v);
  }

  const recipes = GAME_DATA.recipes.filter(r =>
    recipeType === 'all' ? true : r.type === recipeType
  );

  const results: RecipeCoverageItem[] = [];

  for (const r of recipes) {
    let minRate = 1.0;
    let totalRequired = 0;
    let totalCovered = 0;
    let maxMeals = Infinity;
    const missing: MissingIngredientDetail[] = [];

    for (const req of r.ingredients) {
      const avail = invMap.get(req.ingredient.toLowerCase()) || 0;
      totalRequired += req.amount;
      const covered = Math.min(avail, req.amount);
      totalCovered += covered;

      const rate = req.amount > 0 ? avail / req.amount : 1.0;
      if (rate < minRate) minRate = rate;

      const possibleWithThis = req.amount > 0 ? Math.floor(avail / req.amount) : Infinity;
      if (possibleWithThis < maxMeals) maxMeals = possibleWithThis;

      if (avail < req.amount) {
        const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === req.ingredient.toLowerCase());
        missing.push({
          ingredient: req.ingredient,
          longName: ingObj ? ingObj.longName : req.ingredient,
          required: req.amount,
          available: avail,
          missing: req.amount - avail,
        });
      }
    }

    const coverageByRecipe = round(Math.min(1.0, minRate) * 100, 1);
    const coverageByIngredient = totalRequired > 0 ? round((totalCovered / totalRequired) * 100, 1) : 100;
    const potCapacityExceeded = r.nrOfIngredients > potCapacity;
    const canMake = coverageByRecipe >= 100 && !potCapacityExceeded;

    results.push({
      recipe: r,
      coverageByRecipe,
      coverageByIngredient,
      canMake,
      maxMealsPossible: isFinite(maxMeals) ? maxMeals : 0,
      missingIngredients: missing,
      potCapacityExceeded,
    });
  }

  // Sort: dishes that can be made first, then descending by coverageByRecipe
  results.sort((a, b) => {
    if (a.canMake && !b.canMake) return -1;
    if (!a.canMake && b.canMake) return 1;
    return b.coverageByRecipe - a.coverageByRecipe;
  });

  return results;
}

export interface RecommendSingleMealParams {
  inventory: IngredientInventory;
  potCapacity?: number; // default 57
  recipeType?: RecipeType; // curry / salad / dessert
  recipeLevels?: Record<string, number>; // overrides per recipe
  mapBonus?: number; // 0 to 85%
  excludedIngredients?: string[]; // ingredients to avoid using as fillers
}

export interface MealRecommendation {
  recipe: Recipe;
  recipeLevel: number;
  recipeStrengthAtLevel: number;
  fillerIngredients: Array<{ ingredient: string; amount: number; value: number }>;
  fillerStrength: number;
  totalMealStrength: number;
  remainingInventory: IngredientInventory;
}

/**
 * R1 Single-Meal Recipe Recommendation.
 * Evaluates candidate recipes that can be made from current inventory,
 * greedily fills remaining pot capacity with the highest-energy ingredients,
 * and ranks recipes by final total strength.
 */
export function recommendSingleMeal(params: RecommendSingleMealParams): MealRecommendation[] {
  const {
    inventory,
    potCapacity = 57,
    recipeType,
    recipeLevels = {},
    mapBonus = 0,
    excludedIngredients = [],
  } = params;

  // Build lowercase inventory map
  const invMap = new Map<string, number>();
  for (const [k, v] of Object.entries(inventory)) {
    if (v > 0) invMap.set(k.toLowerCase(), v);
  }

  const excludedSet = new Set(excludedIngredients.map(e => e.toLowerCase()));

  // Filter recipes of target type
  const candidateRecipes = GAME_DATA.recipes.filter(r => {
    if (recipeType && r.type !== recipeType) return false;
    if (r.nrOfIngredients > potCapacity) return false;
    // Check if inventory has enough ingredients
    for (const req of r.ingredients) {
      const avail = invMap.get(req.ingredient.toLowerCase()) || 0;
      if (avail < req.amount) return false;
    }
    return true;
  });

  // Prepare ingredients sorted descending by base value for greedy pot filling
  const availableFillers = [...GAME_DATA.ingredients].sort((a, b) => b.value - a.value);

  const recommendations: MealRecommendation[] = [];

  for (const r of candidateRecipes) {
    // Clone inventory for this cooking simulation
    const remainingInv = new Map<string, number>(invMap);

    // Deduct recipe required ingredients
    for (const req of r.ingredients) {
      const key = req.ingredient.toLowerCase();
      const current = remainingInv.get(key) || 0;
      remainingInv.set(key, Math.max(0, current - req.amount));
    }

    let remainingPotSpace = potCapacity - r.nrOfIngredients;
    const fillerList: Array<{ ingredient: string; amount: number; value: number }> = [];

    // Greedily fill remaining pot with highest-value available ingredients
    if (remainingPotSpace > 0) {
      for (const filler of availableFillers) {
        if (remainingPotSpace <= 0) break;
        const key = filler.name.toLowerCase();
        if (excludedSet.has(key)) continue;

        const avail = remainingInv.get(key) || 0;
        if (avail > 0) {
          const toUse = Math.min(avail, remainingPotSpace);
          fillerList.push({
            ingredient: filler.name,
            amount: toUse,
            value: filler.value,
          });
          remainingInv.set(key, avail - toUse);
          remainingPotSpace -= toUse;
        }
      }
    }

    const level = recipeLevels[r.name] || 1;

    // Calculate cooking strength
    const strengthResult = calculateCookingStrength({
      recipeName: r.name,
      recipeLevel: level,
      fillerIngredients: fillerList,
      mapBonus,
    });

    const finalRemaining: IngredientInventory = {};
    for (const [k, v] of remainingInv.entries()) {
      const originalIng = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === k);
      finalRemaining[originalIng ? originalIng.name : k] = v;
    }

    recommendations.push({
      recipe: r,
      recipeLevel: level,
      recipeStrengthAtLevel: strengthResult.recipeStrengthAtLevel,
      fillerIngredients: fillerList,
      fillerStrength: strengthResult.fillerStrength,
      totalMealStrength: strengthResult.finalStrength,
      remainingInventory: finalRemaining,
    });
  }

  // Sort descending by total meal strength
  recommendations.sort((a, b) => b.totalMealStrength - a.totalMealStrength);
  return recommendations;
}
