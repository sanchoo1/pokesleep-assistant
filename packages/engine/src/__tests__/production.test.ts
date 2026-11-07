import { describe, it, expect } from 'vitest';
import { GAME_DATA } from '@pokesleep/data';
import {
  calculateDailyProduction,
  getSpeciesNativeIngredientPool,
} from '../production';
import { analyzeIndividualRecipeCoverage } from '../rating';

describe('Production: L1 Single-Pokemon Daily Calculator', () => {
  it('should accurately calculate Pikachu daily production as a Berry Specialist', () => {
    // Pikachu at Lv 30 with Adamant (+speed), BFS, Helping Speed M
    const prod = calculateDailyProduction({
      pokemon: 'PIKACHU',
      level: 30,
      nature: 'Adamant',
      subskills: ['Berry Finding S', 'Helping Speed M'], // unlocked at Lv 10 & 25
      ingredientSelection: 'AAA',
      isFavoredBerry: true,
      mapBonus: 20,
    });

    expect(prod.pokemon.name).toBe('PIKACHU');
    expect(prod.berriesPerDrop).toBe(3); // Specialty (2) + BFS (1) = 3
    expect(prod.helpingFrequency).toBeLessThan(1200); // Fast interval
    expect(prod.dailyHelps).toBeGreaterThan(70);
    expect(prod.dailyBerryEnergy).toBeGreaterThan(15000); // Strong favored berry output
    expect(prod.totalDailyEnergy).toBeGreaterThan(prod.dailyBerryEnergy);
    expect(prod.dailySkillProcs).toBeGreaterThan(1.0);
  });

  it('should calculate Blastoise daily production as an Ingredient Specialist', () => {
    // Blastoise at Lv 60 with Modest (+ing), Ing Finder M, Ing Finder S
    const prod = calculateDailyProduction({
      pokemon: 'BLASTOISE',
      level: 60,
      nature: 'Modest',
      subskills: ['Ingredient Finder M', 'Ingredient Finder S', 'Helping Speed S'],
      ingredientSelection: 'ABC',
      mapBonus: 0,
    });

    expect(prod.pokemon.specialty).toBe('ingredient');
    expect(prod.unlockedIngredientSlots).toBe(3); // Lv 60 unlocks all 3 slots
    expect(prod.ingredientRate).toBeGreaterThan(0.35); // Boosted ing rate
    expect(prod.dailyIngredients.length).toBeGreaterThanOrEqual(1);
    expect(prod.dailyIngredientCount).toBeGreaterThan(40); // Healthy daily ingredient yield
  });

  it('should calculate Wigglytuff daily production as a Skill Specialist', () => {
    // Wigglytuff with Sassy (+skill), Skill Trigger M, Skill Trigger S
    const prod = calculateDailyProduction({
      pokemon: 'WIGGLYTUFF',
      level: 50,
      nature: 'Sassy',
      subskills: ['Skill Trigger M', 'Skill Trigger S', 'Helping Bonus'],
      mainSkillLevel: 6,
    });

    expect(prod.pokemon.specialty).toBe('skill');
    expect(prod.skillRate).toBeGreaterThan(0.05); // High trigger rate
    expect(prod.dailySkillProcs).toBeGreaterThan(3.0); // 3+ heals per day
  });

  it('should calculate Vaporeon skill ingredients and recipe coverage from Ingredient Magnet S', () => {
    // Vaporeon Lv 50 with Sassy (+skill), Skill Trigger M, Skill Trigger S, main skill Lv 6 (21 ing/proc)
    const prod = calculateDailyProduction({
      pokemon: 'VAPOREON',
      level: 50,
      nature: 'Sassy',
      subskills: ['Skill Trigger M', 'Skill Trigger S', 'Helping Speed M'],
      ingredientSelection: 'AAA',
      mainSkillLevel: 6,
    });

    expect(prod.pokemon.skill.name).toBe('Ingredient Magnet S');
    expect(prod.dailySkillProcs).toBeGreaterThan(4.0); // High proc frequency (~4-5 procs/day)
    expect(prod.skillDailyIngredientCount).toBeGreaterThan(80); // ~90+ skill ingredients / day!
    expect(prod.skillDailyIngredients.length).toBe(19); // Distributed across all 19 ingredients
    expect(prod.combinedDailyIngredientCount).toBeCloseTo(
      prod.dailyIngredientCount + prod.skillDailyIngredientCount,
      2
    );

    const coverage = analyzeIndividualRecipeCoverage(prod, 100);
    expect(coverage.hasSkillIngredients).toBe(true);
    expect(coverage.totalSkillDailyCount).toBeCloseTo(prod.skillDailyIngredientCount, 1);
    expect(coverage.totalCombinedDailyCount).toBeGreaterThan(80);
    // Vaporeon supplies a bit of all ingredients, so it matches relevant recipes across all 3 meal types
    expect(coverage.byType.curry.relevantCount).toBeGreaterThan(10);
    expect(coverage.byType.salad.relevantCount).toBeGreaterThan(10);
    expect(coverage.byType.dessert.relevantCount).toBeGreaterThan(10);

    // Verify each matched ingredient tracks skill contribution
    const sampleDish = coverage.byType.curry.topDishes[0];
    expect(sampleDish).toBeDefined();
    const skillContribution = sampleDish.matchedIngredients.some((m) => m.skillProduced > 0);
    expect(skillContribution).toBe(true);
  });

  it('should calculate Sandslash skill ingredients from Ingredient Draw S (Pumpkin, Corn, Potato)', () => {
    // Sandslash native species ingredients pool
    const nativePool = getSpeciesNativeIngredientPool(prodMon('SANDSLASH'));
    expect(nativePool.sort()).toEqual(['Corn', 'Potato', 'Pumpkin']);

    // Sandslash Lv 50 with Sassy (+skill), Skill Trigger M, Skill Trigger S, main skill Lv 6 (16 ing/proc)
    const prod = calculateDailyProduction({
      pokemon: 'SANDSLASH',
      level: 50,
      nature: 'Sassy',
      subskills: ['Skill Trigger M', 'Skill Trigger S', 'Helping Speed M'],
      ingredientSelection: 'AAA',
      mainSkillLevel: 6,
    });

    expect(prod.pokemon.skill.name).toBe('Ingredient Draw S');
    expect(prod.dailySkillProcs).toBeGreaterThan(2.5);
    expect(prod.skillDailyIngredientCount).toBeGreaterThan(40); // 2.5 * 16 = 40+ ingredients/day
    // Draws strictly from the 3 native ingredients: Pumpkin, Corn, Potato
    const skillIngNames = prod.skillDailyIngredients.map((i) => i.ingredient).sort();
    expect(skillIngNames).toEqual(['Corn', 'Potato', 'Pumpkin']);

    // Each of the 3 ingredients receives 1/3 of the total skill yield
    for (const ing of prod.skillDailyIngredients) {
      expect(ing.amount).toBeCloseTo(prod.skillDailyIngredientCount / 3, 2);
    }

    const coverage = analyzeIndividualRecipeCoverage(prod, 100);
    expect(coverage.hasSkillIngredients).toBe(true);
    expect(coverage.totalSkillDailyCount).toBeGreaterThan(40);

    // High supply of Corn, Potato, and Pumpkin gives high 3-meal coverage for dishes using them
    const saladDishes = coverage.byType.salad.topDishes;
    expect(saladDishes.length).toBeGreaterThan(0);
    const usesDrawIngredients = saladDishes.some((d) =>
      d.matchedIngredients.some((m) => ['Corn', 'Potato', 'Pumpkin'].includes(m.ingredient) && m.skillProduced > 0)
    );
    expect(usesDrawIngredients).toBe(true);
  });
});

function prodMon(name: string) {
  return GAME_DATA.pokemon.find((p) => p.name === name)!;
}

