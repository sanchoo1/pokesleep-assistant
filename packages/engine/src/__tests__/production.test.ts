import { describe, it, expect } from 'vitest';
import { GAME_DATA } from '@pokesleep/data';
import {
  calculateDailyProduction,
  getSpeciesNativeIngredientPool,
} from '../production';
import { rankIngredientProducers, getSpecificIngredientYield } from '../ingredient/ranking';
import { calculateSubskillSpeedFactor } from '../formula/helpingFrequency';
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

  it('should calculate realistic overnight production and sneaky snacking dynamics', () => {
    // Fast Berry specialist with BFS: fills inventory quickly then enters Sneaky Snacking
    const fastRaichu = calculateDailyProduction({
      pokemon: 'RAICHU',
      level: 50,
      nature: 'Adamant',
      subskills: ['Berry Finding S', 'Helping Speed M', 'Helping Speed S'],
      isFavoredBerry: true,
      sleepHours: 8.5,
    });

    const o = fastRaichu.overnightAnalysis;
    expect(o.sleepHours).toBe(8.5);
    expect(o.timeToFullHours).toBeLessThan(4.5); // Fills bag in under 4.5 hours!
    expect(o.isFullDuringSleep).toBe(true);
    expect(o.timeInSneakySnackHours).toBeGreaterThan(4.0); // Spends 4+ hours in Sneaky Snacking
    expect(o.sneakySnackBerries).toBeGreaterThan(0);
    expect(o.totalOvernightEnergy).toBeGreaterThan(0);
    expect(o.efficiencyRatio).toBeGreaterThan(0.9); // Berry specialists retain high overnight efficiency
    expect(o.daytimeCollectionRecommendation).toContain('日间建议每');
  });

  it('should dynamically value pot expansion and tasty chance with custom cookingContext', () => {
    // Magnezone Lv.60
    const magDefault = calculateDailyProduction({
      pokemon: 'MAGNEZONE',
      level: 60,
      nature: 'Modest',
      subskills: ['Skill Trigger M'],
      mainSkillLevel: 6,
    });

    const magHighCooking = calculateDailyProduction({
      pokemon: 'MAGNEZONE',
      level: 60,
      nature: 'Modest',
      subskills: ['Skill Trigger M'],
      mainSkillLevel: 6,
      cookingContext: {
        fillerEnergyPerSlot: 342, // Slowpoke Tail
        recipeMultiplier: 1.48, // Lv.60 recipe bonus
      },
    });

    // Custom filler (342 * 1.48) is ~3.75x higher than default 135
    expect(magHighCooking.dailySkillEnergy).toBeGreaterThan(magDefault.dailySkillEnergy * 3.0);

    // Dedenne Lv.50
    const dedDefault = calculateDailyProduction({
      pokemon: 'DEDENNE',
      level: 50,
      nature: 'Sassy',
      subskills: ['Skill Trigger M'],
      mainSkillLevel: 6,
      cookingContext: { dishEnergyBaseline: 35000 },
    });

    const dedDouble = calculateDailyProduction({
      pokemon: 'DEDENNE',
      level: 50,
      nature: 'Sassy',
      subskills: ['Skill Trigger M'],
      mainSkillLevel: 6,
      cookingContext: { dishEnergyBaseline: 70000 },
    });

    expect(dedDouble.dailySkillEnergy).toBeCloseTo(dedDefault.dailySkillEnergy * 2.0, 1);
  });

  it('should evaluate Lv.80 preview when allowPreviewLv80 is enabled', () => {
    const subskillMap = {
      level10: 'Helping Speed S',
      level25: 'Inventory Up S',
      level50: 'Inventory Up M',
      level70: 'Berry Finding S',
      level80: 'Skill Trigger M',
    };

    const prod80 = calculateDailyProduction({
      pokemon: 'PIKACHU',
      level: 80,
      subskills: subskillMap,
      allowPreviewLv80: true,
    });

    expect(prod80.level).toBe(80);
    expect(prod80.activeSubskills.map((s) => s.name)).toContain('Skill Trigger M');
    expect(prod80.activeSubskills.length).toBe(5);
  });

  it('should support Darkrai and Mew with Locked ingredient slots and Mew Versatile learned skills', () => {
    // 1. Darkrai with slot B & C Locked at Lv.38
    const darkraiProd = calculateDailyProduction({
      pokemon: 'DARKRAI',
      level: 38,
      nature: 'Bashful',
      subskills: ['Skill Level Up S', 'Helping Speed S', 'Helping Speed M'],
      ingredientSelection: { slot0: 'Sausage', slot30: 'Locked', slot60: 'Locked' },
    });

    expect(darkraiProd.pokemon.name).toBe('DARKRAI');
    expect(darkraiProd.dailyIngredients.length).toBe(1);
    expect(darkraiProd.dailyIngredients[0].ingredient).toBe('Sausage');
    expect(darkraiProd.dailyIngredientCount).toBeGreaterThan(0);
    expect(Number.isNaN(darkraiProd.totalDailyEnergy)).toBe(false);

    // 2. Mew with Versatile + Energy for Everyone S
    const mewHealer = calculateDailyProduction({
      pokemon: 'MEW',
      level: 50,
      nature: 'Bashful',
      subskills: ['Skill Trigger M', 'Skill Trigger S'],
      ingredientSelection: { slot0: 'Egg', slot30: 'Locked', slot60: 'Locked' },
      mainSkillLevel: 6,
      mewLearnedSkill: 'Energy For Everyone S',
    });

    expect(mewHealer.pokemon.name).toBe('MEW');
    expect(mewHealer.skillActivationDetails.skillName).toContain('Energy For Everyone S');
    // Dual activations: candy + learned skill
    const candyEntry = mewHealer.skillActivationDetails.activations.find((b) => b.key === 'candy');
    const energyEntry = mewHealer.skillActivationDetails.activations.find((b) => b.key.includes('energy'));
    expect(candyEntry).toBeDefined();
    expect(energyEntry).toBeDefined();
    expect(candyEntry!.dailySelf).toBeGreaterThan(0);
    expect(mewHealer.dailySkillEnergy).toBeGreaterThan(candyEntry!.estimatedDailyEnergy);

    // 3. Mew with Versatile + Ingredient Magnet S
    const mewMagnet = calculateDailyProduction({
      pokemon: 'MEW',
      level: 50,
      nature: 'Bashful',
      subskills: ['Skill Trigger M', 'Skill Trigger S'],
      ingredientSelection: { slot0: 'Egg', slot30: 'Locked', slot60: 'Locked' },
      mainSkillLevel: 6,
      mewLearnedSkill: 'Ingredient Magnet S',
    });

    expect(mewMagnet.skillDailyIngredients.length).toBeGreaterThan(10);
    expect(mewMagnet.skillDailyIngredientCount).toBeGreaterThan(20);
  });

  it('should accurately calculate Helping Bonus as 25% in individual mode and 5% in team mode', () => {
    // 1. In physical frequency, 1 HB gives 5% (factor 0.95)
    const factorTeamSolo = calculateSubskillSpeedFactor(['Helping Bonus'], 0);
    expect(factorTeamSolo).toBe(0.95);

    // In team mode with 2 teammates also having HB (total 3 HB = 15%), factor is 0.85
    const factorTeamStacked = calculateSubskillSpeedFactor(['Helping Bonus'], 2);
    expect(factorTeamStacked).toBe(0.85);

    // 2. calculateDailyProduction with HB in individual mode vs team mode
    const prodIndiv = calculateDailyProduction({
      pokemon: 'PIKACHU',
      level: 30,
      subskills: ['Helping Bonus'],
      helpingBonusMode: 'individual25',
    });
    const prodTeamSolo = calculateDailyProduction({
      pokemon: 'PIKACHU',
      level: 30,
      subskills: ['Helping Bonus'],
      helpingBonusMode: 'teamSolo5',
    });

    // Individual mode (+20% team credit) produces exactly 20% more daily helps than solo 5%
    expect(prodIndiv.dailyHelps).toBeCloseTo(prodTeamSolo.dailyHelps * 1.2, 2);
  });

  it('should rank ingredient specialists and calculate specific ingredient yields', () => {
    // 1. Rank Mushroom producers at Lv.60
    const shroomRanking = rankIngredientProducers({
      targetIngredient: 'Mushroom',
      level: 60,
      onlyFinalEvolution: true,
    });

    expect(shroomRanking.targetIngredient).toBe('Mushroom');
    expect(shroomRanking.entries.length).toBeGreaterThan(0);

    // Quagsire and Gengar should be present in top rankings
    const names = shroomRanking.entries.map((e) => e.pokemon.name);
    expect(names).toContain('QUAGSIRE');
    expect(names).toContain('GENGAR');

    // Top ranking entry should have 100% relative percentage
    expect(shroomRanking.entries[0].relativePercentage).toBe(100);
    expect(shroomRanking.entries[0].dailyTargetYield).toBeGreaterThan(30);

    // 2. getSpecificIngredientYield
    const blastoise = calculateDailyProduction({
      pokemon: 'BLASTOISE',
      level: 60,
      ingredientSelection: { slot0: 'Milk', slot30: 'Cacao', slot60: 'Cacao' },
    });
    const milkYield = getSpecificIngredientYield(blastoise, 'Milk');
    const cacaoYield = getSpecificIngredientYield(blastoise, 'Cacao');

    expect(milkYield.dailyYield).toBeGreaterThan(10);
    expect(cacaoYield.dailyYield).toBeGreaterThan(35);
    expect(milkYield.dailyYield + cacaoYield.dailyYield).toBeLessThanOrEqual(blastoise.combinedDailyIngredientCount);
  });
});

function prodMon(name: string) {
  return GAME_DATA.pokemon.find((p) => p.name === name)!;
}

describe('Cross-Species Benchmarking: Energy & Skill Rankings', () => {
  it('should flexibly benchmark Meganium (berry) vs Sceptile (skill) under Durin berry & Lapis Lakeside', async () => {
    const { rankEnergyProducers } = await import('../ranking/energyRanking');

    // 1. All specialties on Durin Berry: Meganium vs Sceptile compete directly
    const allDurin = rankEnergyProducers({
      scope: 'same_berry',
      targetBerry: 'DURIN',
      specialtyFilter: 'all',
      level: 50,
      metric: 'total_energy',
      currentPokemon: {
        pokemonName: 'MEGANIUM',
        level: 50,
        nature: 'Adamant',
        subskills: ['Berry Finding S', 'Helping Speed M'],
      },
    });

    expect(allDurin.entries.length).toBeGreaterThanOrEqual(4);
    const monNames = allDurin.entries.map((e) => e.pokemon.name);
    expect(monNames).toContain('MEGANIUM');
    expect(monNames).toContain('SCEPTILE');

    // The current analyzed Meganium should be present and marked
    const currentEntry = allDurin.entries.find((e) => e.isCurrentPokemon);
    expect(currentEntry).toBeDefined();
    expect(currentEntry!.pokemon.name).toBe('MEGANIUM');

    // 2. Berry only filter: Sceptile should be excluded, Meganium remains
    const berryOnlyDurin = rankEnergyProducers({
      scope: 'same_berry',
      targetBerry: 'DURIN',
      specialtyFilter: 'berry',
      level: 50,
    });
    const berryMonNames = berryOnlyDurin.entries.map((e) => e.pokemon.name);
    expect(berryMonNames).toContain('MEGANIUM');
    expect(berryMonNames).not.toContain('SCEPTILE');

    // 3. Same Island (Lapis Lakeside): includes Durin (Grass), Cheri (Fighting), Mago (Psychic)
    const lapisRanking = rankEnergyProducers({
      scope: 'same_island',
      targetIslandName: 'Lapis Lakeside',
      specialtyFilter: 'all',
      level: 50,
    });
    expect(lapisRanking.targetIsland).toBeDefined();
    expect(lapisRanking.targetIsland!.name).toBe('Lapis Lakeside');
    const lapisMonNames = lapisRanking.entries.map((e) => e.pokemon.name);
    expect(lapisMonNames).toContain('MEGANIUM');
    expect(lapisMonNames).toContain('PRIMEAPE'); // Cheri
  });

  it('should rank skill specialists by role (healers, pot expansion, charge strength)', async () => {
    const { rankSkillSpecialists, detectSkillCategory } = await import('../ranking/skillRanking');

    // 1. Category auto-detection
    const wiggly = GAME_DATA.pokemon.find((p) => p.name === 'WIGGLYTUFF')!;
    const magnezone = GAME_DATA.pokemon.find((p) => p.name === 'MAGNEZONE')!;
    const ampharos = GAME_DATA.pokemon.find((p) => p.name === 'AMPHAROS')!;

    expect(detectSkillCategory(wiggly)).toBe('healer');
    expect(detectSkillCategory(magnezone)).toBe('pot_expansion');
    expect(detectSkillCategory(ampharos)).toBe('charge_strength');

    // 2. Healers ranking: Wigglytuff, Sylveon, Gardevoir
    const healerRanking = rankSkillSpecialists({
      category: 'healer',
      metric: 'skill_procs',
      level: 50,
      currentPokemon: {
        pokemonName: 'WIGGLYTUFF',
        level: 53,
        nature: 'Sassy',
        subskills: ['Helping Bonus', 'Skill Trigger M', 'Ingredient Finder S'],
        mainSkillLevel: 6,
      },
    });

    expect(healerRanking.entries.length).toBeGreaterThanOrEqual(3);
    const healerNames = healerRanking.entries.map((e) => e.pokemon.name);
    expect(healerNames).toContain('WIGGLYTUFF');
    expect(healerNames).toContain('SYLVEON');
    expect(healerNames).toContain('GARDEVOIR');

    const currentWiggly = healerRanking.entries.find((e) => e.isCurrentPokemon);
    expect(currentWiggly).toBeDefined();
    expect(currentWiggly!.dailySkillProcs).toBeGreaterThan(5.0);
    expect(currentWiggly!.quantifiedValue).toBeGreaterThan(400); // 5+ procs * 90+ team energy

    // 3. Pot expansion ranking
    const potRanking = rankSkillSpecialists({
      category: 'pot_expansion',
      metric: 'skill_value',
      level: 50,
    });
    const potNames = potRanking.entries.map((e) => e.pokemon.name);
    expect(potNames).toContain('MAGNEZONE');
    expect(potNames).toContain('FLAREON');
  });
});


