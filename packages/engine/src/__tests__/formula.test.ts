import { describe, it, expect } from 'vitest';
import {
  calculateHelpingFrequency,
  calculateBaseBerryStrength,
  calculateBerryStrength,
  calculateCookingStrength,
  calculatePotCapacity,
  calculateCarryLimit,
  calculateSkillRate,
  calculateIngredientRate,
} from '../formula';
import { GAME_DATA } from '@pokesleep/data';

describe('Formula: Helping Frequency', () => {
  it('should calculate Pikachu base interval at Lv 1 with 80%+ energy', () => {
    // Pikachu base frequency = 2700s. With energy 0.45:
    // rawM = 1.0 * 1.0 * 1.0 * 1.0 * 1.0 * 0.45 = 0.45
    // F = floor(2700 * 0.45) = 1215 seconds
    const res = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      energyMultiplier: 0.45,
    });
    expect(res.frequency).toBe(1215);
    expect(res.levelFactor).toBe(1.0);
    expect(res.combinedMultiplier).toBe(0.45);
  });

  it('should apply level speed factor (0.2% per level)', () => {
    // Level 50: levelFactor = 1 - 0.002 * 49 = 0.902
    const res = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 50,
      energyMultiplier: 1.0, // baseline energy
    });
    expect(res.levelFactor).toBeCloseTo(0.902, 5);
    expect(res.frequency).toBe(Math.floor(2700 * 0.902));
  });

  it('should apply nature speed modifier (+speed 0.9, -speed 1.075)', () => {
    const adamant = GAME_DATA.natures.find(n => n.name === 'Adamant')!;
    const modest = GAME_DATA.natures.find(n => n.name === 'Modest')!;

    const fastRes = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      nature: adamant,
      energyMultiplier: 1.0,
    });
    expect(fastRes.natureFactor).toBe(0.9);
    expect(fastRes.frequency).toBe(Math.floor(2700 * 0.9));

    const slowRes = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      nature: modest,
      energyMultiplier: 1.0,
    });
    expect(slowRes.natureFactor).toBe(1.075);
    expect(slowRes.frequency).toBe(Math.floor(2700 * 1.075));
  });

  it('should apply helping speed subskills and clamp at 35% max boost', () => {
    // Help S (0.07) + Help M (0.14) = 0.21 boost => factor 0.79
    const res1 = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      subskills: ['Helping Speed S', 'Helping Speed M'],
      energyMultiplier: 1.0,
    });
    expect(res1.subskillFactor).toBe(0.79);

    // Help M (0.14) + Help S (0.07) + 3x Helping Bonus (0.15) = 0.36 => clamped to 0.35 => factor 0.65
    const res2 = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      subskills: ['Helping Speed M', 'Helping Speed S', 'Helping Bonus'],
      nrOfTeamHelpingBonus: 2,
      energyMultiplier: 1.0,
    });
    expect(res2.subskillFactor).toBe(0.65);
  });

  it('should apply Good Night Ribbon frequency reductions', () => {
    // Ribbon Level 2 on a 1-remaining-evolution mon reduces frequency by 5% (factor 0.95)
    const res = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      ribbonLevel: 2,
      remainingEvolutions: 1,
      energyMultiplier: 1.0,
    });
    expect(res.ribbonFactor).toBe(0.95);
    expect(res.frequency).toBe(Math.floor(2700 * 0.95));
  });

  it('should apply Good Camp Ticket 20% speed boost (0.8 multiplier)', () => {
    const res = calculateHelpingFrequency({
      baseFrequency: 2700,
      level: 1,
      goodCampTicket: true,
      energyMultiplier: 1.0,
    });
    expect(res.campFactor).toBe(0.8);
    expect(res.frequency).toBe(Math.floor(2700 * 0.8));
  });
});

describe('Formula: Berry Strength', () => {
  it('should correctly calculate base berry strength at level milestones', () => {
    // Grepa baseValue = 25
    // Lv 1: max(25, 25 * 1.025^0) = 25
    expect(calculateBaseBerryStrength(25, 1)).toBe(25);

    // Lv 30: linear = 25 + 29 = 54; exponential = 25 * 1.025^29 = 51.19 => max is 54
    expect(calculateBaseBerryStrength(25, 30)).toBe(54);

    // Lv 50: linear = 25 + 49 = 74; exponential = 25 * 1.025^49 = 83.56 => max is 84
    expect(calculateBaseBerryStrength(25, 50)).toBe(84);

    // Lv 60: linear = 25 + 59 = 84; exponential = 25 * 1.025^59 = 106.94 => max is 107
    expect(calculateBaseBerryStrength(25, 60)).toBe(107);
  });

  it('should scale berry strength with favored berries (2x) and island map bonus', () => {
    // Base 25 at Lv 1 = 25. With favored 2x and 50% map bonus:
    // ceil(25 * 1.5 * 2) = ceil(75) = 75
    const res = calculateBerryStrength({
      baseValue: 25,
      level: 1,
      isFavored: true,
      mapBonus: 50,
    });
    expect(res.finalStrength).toBe(75);
  });
});

describe('Formula: Cooking Strength', () => {
  it('should calculate recipe strength at Lv 1 and with Lv 70 bonus', () => {
    // Fancy Apple Curry: 7 apples * 90 = 630. Bonus = 18.7%.
    // Base: round(630 * 1.187) = 748
    const res1 = calculateCookingStrength({
      recipeName: 'FANCY_APPLE_CURRY',
      recipeLevel: 1,
    });
    expect(res1.recipeBaseStrength).toBe(748);
    expect(res1.finalStrength).toBe(748);

    // At Lv 70: recipeLevelBonus[70] = 3.58.
    // Value: round(630 * 3.58 * 1.187) = round(2677.16) = 2677
    const res70 = calculateCookingStrength({
      recipeName: 'FANCY_APPLE_CURRY',
      recipeLevel: 70,
    });
    expect(res70.recipeStrengthAtLevel).toBe(2677);
  });

  it('should add filler ingredients and apply island map bonus and crit multipliers', () => {
    // Fancy Apple Curry (748 at Lv 1) + 10 Slowpoke Tails (10 * 342 = 3420)
    // subtotal = 748 + 3420 = 4168
    // With 50% mapBonus: floor(4168 * 1.5) = 6252
    const res = calculateCookingStrength({
      recipeName: 'FANCY_APPLE_CURRY',
      recipeLevel: 1,
      fillerIngredients: [{ ingredient: 'Tail', amount: 10, value: 342 }],
      mapBonus: 50,
    });
    expect(res.subtotal).toBe(4168);
    expect(res.finalStrength).toBe(6252);

    // Weekday crit (2x): floor(4168 * 1.5 * 2) = 12504
    const resCrit = calculateCookingStrength({
      recipeName: 'FANCY_APPLE_CURRY',
      recipeLevel: 1,
      fillerIngredients: [{ ingredient: 'Tail', amount: 10, value: 342 }],
      mapBonus: 50,
      critMode: 'weekday_crit',
    });
    expect(resCrit.finalStrength).toBe(12504);
  });
});

describe('Formula: Pot Capacity & Carry Limit', () => {
  it('should calculate pot capacity with Sunday bonus, Good Camp Ticket, and skill boosts', () => {
    // Base 57 on Sunday: 57 * 2 = 114
    // Plus Cooking Power-Up S +10 = 124
    // Plus Good Camp Ticket (1.5x): round(124 * 1.5) = 186
    const res = calculatePotCapacity({
      basePotSize: 57,
      isSunday: true,
      cookingPowerUpBonus: 10,
      goodCampTicket: true,
    });
    expect(res.totalCapacity).toBe(186);
  });

  it('should calculate carry limit with previous evolutions, subskills, and ribbons', () => {
    // Raichu base carry size = 21, previous evolutions = 2 (+10) -> 31
    // Subskills: Inv M (+12) -> 43
    // Ribbon: Lv 3 (+6) -> 49
    // Good Camp Ticket: ceil(49 * 1.2) = ceil(58.8) = 59
    const res = calculateCarryLimit({
      baseCarrySize: 21,
      previousEvolutions: 2,
      subskills: ['Inventory Up M'],
      ribbonLevel: 3,
      goodCampTicket: true,
    });
    expect(res.totalCarryLimit).toBe(59);
  });
});

describe('Formula: Skill & Ingredient Proc Rates', () => {
  it('should calculate ingredient rate with nature and subskills', () => {
    // Base 20%: +ing nature (1.2) + Ing M (0.36) => 20% * 1.2 * 1.36 = 32.64%
    const nature = GAME_DATA.natures.find(n => n.name === 'Quiet')!; // +ing
    const rate = calculateIngredientRate({
      baseIngredientPercentage: 20.0,
      nature,
      subskills: ['Ingredient Finder M'],
    });
    expect(rate).toBeCloseTo(0.3264, 4);
  });

  it('should calculate skill trigger rate with pity proc mechanism', () => {
    // Base 2.0%, pity proc threshold 78
    // With pity proc, effective rate must be strictly higher than without pity proc
    const res = calculateSkillRate({
      baseSkillPercentage: 2.0,
      pityProcThreshold: 78,
      withPity: true,
    });
    expect(res.rateWithoutPity).toBe(0.02);
    expect(res.rateWithPity).toBeGreaterThan(0.02);
    expect(res.effectiveRate).toBe(res.rateWithPity);
  });
});
