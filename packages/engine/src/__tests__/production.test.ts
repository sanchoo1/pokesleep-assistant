import { describe, it, expect } from 'vitest';
import { calculateDailyProduction } from '../production';

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
});
