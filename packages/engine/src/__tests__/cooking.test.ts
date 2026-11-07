import { describe, it, expect } from 'vitest';
import { calculateMealCoverage, recommendSingleMeal } from '../cooking';

describe('Cooking: Meal Coverage & R1 Recommendation', () => {
  describe('calculateMealCoverage', () => {
    it('should correctly determine recipe coverage and missing ingredients', () => {
      // Fancy Apple Curry requires 7 Apples.
      // Suppose we have 5 Apples.
      const res = calculateMealCoverage({
        inventory: { Apple: 5 },
        recipeType: 'curry',
        potCapacity: 57,
      });

      const appleCurry = res.find(r => r.recipe.name === 'FANCY_APPLE_CURRY')!;
      expect(appleCurry).toBeDefined();
      expect(appleCurry.canMake).toBe(false);
      expect(appleCurry.coverageByRecipe).toBeCloseTo(71.4, 1); // 5 / 7 = 71.4%
      expect(appleCurry.missingIngredients.length).toBe(1);
      expect(appleCurry.missingIngredients[0].missing).toBe(2);
    });

    it('should mark recipe as makeable when inventory meets all demands', () => {
      // Suppose we have 20 Apples, 10 Milks, 10 Sausages
      const res = calculateMealCoverage({
        inventory: { Apple: 20, Milk: 10, Sausage: 10 },
        recipeType: 'curry',
        potCapacity: 57,
      });

      const appleCurry = res.find(r => r.recipe.name === 'FANCY_APPLE_CURRY')!;
      expect(appleCurry.canMake).toBe(true);
      expect(appleCurry.coverageByRecipe).toBe(100);
      expect(appleCurry.maxMealsPossible).toBe(2); // 20 / 7 = 2 meals
      expect(appleCurry.missingIngredients.length).toBe(0);
    });
  });

  describe('recommendSingleMeal', () => {
    it('should recommend best recipe and greedily fill remaining pot space with highest-value ingredients', () => {
      // Inventory:
      // Apple: 10 (base value 90)
      // Honey: 10 (base value 101)
      // Tail: 5 (base value 342 - highest energy filler!)
      // Pot capacity: 30
      const recommendations = recommendSingleMeal({
        inventory: {
          Apple: 10,
          Honey: 10,
          Tail: 5,
        },
        recipeType: 'curry',
        potCapacity: 30,
        mapBonus: 0,
      });

      expect(recommendations.length).toBeGreaterThan(0);
      const top = recommendations[0];

      // Top recommendation should use high value fillers like Tail
      expect(top.fillerIngredients.some(f => f.ingredient === 'Tail')).toBe(true);
      expect(top.fillerStrength).toBeGreaterThan(0);
      expect(top.totalMealStrength).toBeGreaterThan(top.recipeStrengthAtLevel);

      // Remaining inventory should have tails deducted
      expect(top.remainingInventory.Tail).toBeLessThan(5);
    });
  });
});
