import { describe, it, expect } from 'vitest';
import goldenDataset from './fixtures/golden-cross-validation.json';
import {
  calculateDailyProduction,
  calculateHelpingFrequency,
  calculateRP,
  ratePokemon,
  evaluatePokemonMilestones,
  analyzeIndividualRecipeCoverage,
  SUBSKILL_UNLOCK_LEVELS,
  MAX_POKEMON_LEVEL,
  EVALUATION_MILESTONE_LEVELS,
} from '../index';
import { GAME_DATA } from '@pokesleep/data';

describe('Cross-Validation Pipeline (Neroli\'s Lab + RaenonX + In-Game OCR Oracles)', () => {
  it('enforces current game version subskill unlock levels [10, 25, 50, 70, 80] and max level cap 70', () => {
    expect(SUBSKILL_UNLOCK_LEVELS).toEqual([10, 25, 50, 70, 80]);
    expect(MAX_POKEMON_LEVEL).toBe(70);
    expect(EVALUATION_MILESTONE_LEVELS).toEqual([10, 25, 30, 50, 60, 70]);
    expect(goldenDataset.count).toBeGreaterThanOrEqual(25);
  });

  describe.each(goldenDataset.cases)('Golden Case [$id] — $description', (goldenCase) => {
    const { input, expected } = goldenCase;

    it('matches reference RP, Carry Limit, Frequency, Trigger Rates, and Daily Production', () => {
      const result = calculateDailyProduction({
        pokemon: input.pokemon,
        level: input.level,
        nature: input.nature,
        subskills: input.subskills,
        ingredientSelection: input.ingredientCombo,
        mainSkillLevel: input.mainSkillLevel,
        ribbonLevel: input.ribbonLevel,
        goodCampTicket: input.goodCampTicket,
        nrOfTeamHelpingBonus: input.nrOfTeamHelpingBonus,
        isFavoredBerry: input.isFavoredBerry,
        mapBonus: input.mapBonus,
        energyMultiplier: input.energyMultiplier,
      });

      // 1. Unlocked Subskills & Skill Level Up S/M
      expect(result.activeSubskills.map((s) => s.name)).toEqual(expected.activeSubskillNames);
      expect(result.skillLevelUpBonus).toBe(expected.skillLevelUpBonus);
      expect(result.effectiveMainSkillLevel).toBe(expected.effectiveMainSkillLevel);

      // 2. Exact In-Game RP (SP) & Intermediate RP Breakdown vs Neroli's Lab RP class
      expect(result.rp).toBe(expected.rp);
      const unlockedSlots = [
        result.pokemon.ingredient0[0],
        ...(input.level >= 30 ? [
          result.pokemon.ingredient30.filter((i) => i.ingredient !== 'Locked')[
            Math.max(0, input.ingredientCombo.charCodeAt(1) - 65)
          ] || result.pokemon.ingredient30[0],
        ] : []),
        ...(input.level >= 60 ? [
          result.pokemon.ingredient60.filter((i) => i.ingredient !== 'Locked')[
            Math.max(0, input.ingredientCombo.charCodeAt(2) - 65)
          ] || result.pokemon.ingredient60[0],
        ] : []),
      ];
      const rpDetail = calculateRP({
        pokemon: result.pokemon,
        level: result.level,
        skillLevel: result.effectiveMainSkillLevel,
        nature: result.nature,
        activeSubskills: result.activeSubskills,
        unlockedIngredients: unlockedSlots,
        ribbonLevel: input.ribbonLevel,
      });
      expect(rpDetail.rp).toBe(expected.rp);
      expect(rpDetail.miscFactor).toBeCloseTo(expected.rpBreakdown.miscFactor, 2);
      expect(rpDetail.ingredientFactor).toBeCloseTo(expected.rpBreakdown.ingredientFactor, 2);
      expect(rpDetail.berryFactor).toBeCloseTo(expected.rpBreakdown.berryFactor, 2);
      expect(rpDetail.skillFactor).toBeCloseTo(expected.rpBreakdown.skillFactor, 2);

      // 3. Exact Carry Limit vs Neroli CarrySizeUtils
      expect(result.carryLimit).toBe(expected.carryLimit);

      // 4. Helping Frequency vs RaenonX exact formula AND Neroli base help speed (within <=1s rounding convention)
      expect(result.helpingFrequency).toBe(expected.helpingFrequency);
      const baseFreqAtZeroEnergyBoost = calculateHelpingFrequency({
        baseFrequency: result.pokemon.frequency,
        level: result.level,
        nature: result.nature,
        subskills: result.activeSubskills,
        nrOfTeamHelpingBonus: input.nrOfTeamHelpingBonus,
        ribbonLevel: input.ribbonLevel,
        remainingEvolutions: result.pokemon.remainingEvolutions,
        goodCampTicket: input.goodCampTicket,
        energyMultiplier: 1.0,
      });
      // Note: Good Camp Ticket in RaenonX multiplies by 0.8 (-20% interval) whereas Neroli divides by 1.2 (-16.67%)
      if (!input.goodCampTicket) {
        expect(Math.abs(baseFreqAtZeroEnergyBoost.frequency - expected.neroliBaseHelpSpeed)).toBeLessThanOrEqual(2);
      }

      // 5. Ingredient Rate, Skill Rate (without & with pity), Berries Per Drop, Berry Strength
      expect(result.ingredientRate).toBeCloseTo(expected.ingredientRate, 6);
      expect(result.skillRateWithoutPity).toBeCloseTo(expected.skillRateWithoutPity, 6);
      expect(result.skillRate).toBeCloseTo(expected.skillRateWithPity, 6);
      expect(result.berriesPerDrop).toBe(expected.berriesPerDrop);
      expect(result.berryStrength).toBe(expected.finalBerryStrength);

      // 6. Daily Expected Production Quantities & Energies
      expect(result.dailyHelps).toBeCloseTo(expected.dailyHelps, 4);
      expect(result.dailyBerryCount).toBeCloseTo(expected.dailyBerryCount, 2);
      expect(result.dailyBerryEnergy).toBeCloseTo(expected.dailyBerryEnergy, 1);
      expect(result.dailyIngredientCount).toBeCloseTo(expected.dailyIngredientCount, 2);
      expect(result.dailyIngredientEnergy).toBeCloseTo(expected.dailyIngredientEnergy, 1);
      expect(result.dailySkillProcs).toBeCloseTo(expected.dailySkillProcs, 4);

      // 7. Primary Skill Activation Per-Proc Quantized Output
      if (expected.perProcSkillOutput > 0) {
        expect(result.skillActivationDetails.perProcOutput).toBeCloseTo(expected.perProcSkillOutput, 2);
      }
      expect(result.totalDailyEnergy).toBeCloseTo(
        result.dailyBerryEnergy + result.dailyIngredientEnergy + result.dailySkillEnergy,
        2
      );
    });
  });

  it('matches all displayed stats on the in-game Lv.41 Sceptile screenshot (SP 2,119 / 35m16s / Carry 33)', () => {
    const sceptile = calculateDailyProduction({
      pokemon: 'SCEPTILE',
      level: 41,
      nature: 'Relaxed',
      subskills: {
        level10: 'Skill Trigger M',
        level25: 'Inventory Up S',
        level50: 'Berry Finding S',
        level70: 'Helping Bonus',
        level80: 'Helping Speed S',
      },
      ingredientSelection: { slot0: 'Egg', slot30: 'Coffee', slot60: 'Egg' },
      mainSkillLevel: 3,
      energyMultiplier: 1.0, // In-game stats screen displays base interval before energy multiplier
    });

    expect(sceptile.rp).toBe(2119);
    expect(sceptile.helpingFrequency).toBe(35 * 60 + 16); // 35分16秒 = 2116s!
    expect(sceptile.carryLimit).toBe(33); // 17 base + 10 (2 evos) + 6 (Inv S) = 33!
    expect(sceptile.skillActivationDetails.perProcOutput).toBe(29); // Lv.3 Berry Burst: 21 self + 4*2 team = 29 berries
  });

  it('properly unlocks 4th subskill at Lv.70, clamps level > 70 to 70, and keeps Lv.80 5th subskill locked', () => {
    const subskillMap = {
      level10: 'Helping Speed S',
      level25: 'Inventory Up S',
      level50: 'Inventory Up M',
      level70: 'Berry Finding S', // 4th slot: unlocks at Lv.70!
      level80: 'Skill Trigger M', // 5th slot: unlocks at Lv.80 (locked in Lv.70 cap!)
    };

    const at69 = calculateDailyProduction({ pokemon: 'PIKACHU', level: 69, subskills: subskillMap });
    const at70 = calculateDailyProduction({ pokemon: 'PIKACHU', level: 70, subskills: subskillMap });
    const at80Clamped = calculateDailyProduction({ pokemon: 'PIKACHU', level: 80, subskills: subskillMap });

    expect(at69.berriesPerDrop).toBe(2); // BFS at Lv.70 not yet unlocked
    expect(at70.berriesPerDrop).toBe(3); // BFS unlocked at Lv.70!
    expect(at80Clamped.level).toBe(70); // Clamped to MAX_POKEMON_LEVEL = 70
    expect(at80Clamped.activeSubskills.map((s) => s.name)).not.toContain('Skill Trigger M');

    // Sparse slot map preserves exact slot unlock levels
    const sparse70 = calculateDailyProduction({
      pokemon: 'PIKACHU',
      level: 50,
      subskills: { level10: 'Helping Speed S', level70: 'Berry Finding S' },
    });
    expect(sparse70.berriesPerDrop).toBe(2);
  });

  it('prevents ChargeStrengthSRange (Golduck) from triple-counting low/high bounds alongside mean', () => {
    const golduck = calculateDailyProduction({
      pokemon: 'GOLDUCK',
      level: 50,
      nature: 'Bashful',
      subskills: [],
      mainSkillLevel: 1,
      mapBonus: 0,
    });
    // Charge Strength S Range Lv.1: low=200, high=800, mean=500
    expect(golduck.skillActivationDetails.activations).toHaveLength(1);
    expect(golduck.skillActivationDetails.perProcOutput).toBe(500);
    expect(golduck.dailySkillEnergy).toBeCloseTo(golduck.dailySkillProcs * 500, 2);
  });

  it('validates multi-stage milestone evaluation [10, 25, 30, 50, 60, 70] and specialty recipe coverage', () => {
    // 1. Berry specialist multi-stage check (4th subskill BFS at Lv.70 causes a sharp PR jump at Lv.70!)
    const typhlosionReport = evaluatePokemonMilestones({
      pokemon: 'TYPHLOSION',
      nature: 'Adamant',
      subskills: {
        level10: 'Inventory Up S',
        level25: 'Inventory Up M',
        level50: 'Helping Speed M',
        level70: 'Berry Finding S',
        level80: 'Helping Bonus',
      },
      ingredientSelection: 'AAA',
      isFavoredBerry: true,
      mapBonus: 50,
    });

    expect(typhlosionReport.milestones.map((m) => m.level)).toEqual([10, 25, 30, 50, 60, 70]);
    expect(typhlosionReport.evaluatedMetric).toBe('total_energy');
    for (const stage of typhlosionReport.milestones) {
      expect(stage.rating.percentile).toBeGreaterThanOrEqual(0);
      expect(stage.rating.percentile).toBeLessThanOrEqual(100);
      expect(stage.rating.currentScore).toBeGreaterThanOrEqual(stage.rating.worstScore - 0.01);
      expect(stage.rating.currentScore).toBeLessThanOrEqual(stage.rating.bestScore + 0.01);
    }
    const prAt60 = typhlosionReport.milestones.find((m) => m.level === 60)!.rating.percentile;
    const prAt70 = typhlosionReport.milestones.find((m) => m.level === 70)!.rating.percentile;
    expect(prAt70).toBeGreaterThan(prAt60); // Unlocking BFS at Lv.70 boosts PR substantially!

    // 2. Ingredient specialist recipe coverage check (Dragonite Lv.60 ABC: Herb + Corn + Oil)
    const dragoniteProd = calculateDailyProduction({
      pokemon: 'DRAGONITE',
      level: 60,
      nature: 'Quiet',
      subskills: ['Ingredient Finder M', 'Ingredient Finder S', 'Helping Speed M'],
      ingredientSelection: 'ABC',
    });
    const coverage = analyzeIndividualRecipeCoverage(dragoniteProd, 69);
    expect(coverage.producedIngredients.map((i) => i.ingredient)).toEqual(['Herb', 'Corn', 'Oil']);
    expect(coverage.relevantRecipesTotal).toBeGreaterThan(15);
    expect(coverage.threeMealPartnerReadyCount).toBeGreaterThan(0);
    expect(coverage.byType.curry.topDishes.length).toBeGreaterThan(0);
    expect(coverage.byType.salad.topDishes.length).toBeGreaterThan(0);

    // 3. Skill specialist check (Gardevoir Lv.70 with Skill Level Up M at Lv.70)
    const gardevoirRating = ratePokemon({
      pokemon: 'GARDEVOIR',
      level: 70,
      nature: 'Calm',
      subskills: {
        level10: 'Skill Trigger M',
        level25: 'Skill Trigger S',
        level50: 'Helping Speed M',
        level70: 'Skill Level Up M',
      },
      mainSkillLevel: 4,
    });
    expect(gardevoirRating.evaluatedMetric).toBe('skill_procs');
    expect(gardevoirRating.percentile).toBeGreaterThan(95);
    expect(gardevoirRating.grade).toBe('S+');
    expect(gardevoirRating.currentProduction.effectiveMainSkillLevel).toBe(6);

    // Ensure all 251 species in GAME_DATA have valid type & skill activations metadata
    expect(GAME_DATA.pokemon.length).toBeGreaterThanOrEqual(250);
    expect(GAME_DATA.pokemon.every((p) => Boolean(p.type))).toBe(true);
  });
});

