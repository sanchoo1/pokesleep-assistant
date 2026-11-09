import { describe, it, expect } from 'vitest';
import {
  getAvailableSilverSeedUpgrades,
  applyResourceInvestment,
  isNatureNeutral,
  shouldNeutralizeNature,
} from '../rating/resourceSimulation';

describe('Resource Simulation (Gold Seeds, Silver Seeds, Neutralizing Mint)', () => {
  it('should correctly identify neutral natures and recommendation for neutralizing mint', () => {
    expect(isNatureNeutral('Bashful')).toBe(true);
    expect(isNatureNeutral('Hardy')).toBe(true);
    expect(isNatureNeutral('Adamant')).toBe(false);
    expect(isNatureNeutral('Quiet')).toBe(false);

    // Berry specialist: Calm has negative speed -> should neutralize!
    expect(shouldNeutralizeNature('berry', 'energy', 'speed')).toBe(true);
    // Berry specialist: Adamant has positive speed -> keep it!
    expect(shouldNeutralizeNature('berry', 'speed', 'ingredient')).toBe(false);

    // Skill specialist: Naughty has negative skill -> should neutralize!
    expect(shouldNeutralizeNature('skill', 'speed', 'skill')).toBe(true);
    // Skill specialist: Careful has positive skill -> keep it!
    expect(shouldNeutralizeNature('skill', 'skill', 'ingredient')).toBe(false);

    // Ingredient specialist: Jolly has negative ingredient -> should neutralize!
    expect(shouldNeutralizeNature('ingredient', 'speed', 'ingredient')).toBe(true);
    // Ingredient specialist: Quiet has positive ingredient -> keep it!
    expect(shouldNeutralizeNature('ingredient', 'ingredient', 'exp')).toBe(false);
  });

  it('should identify upgradeable subskills in priority order for skill specialists', () => {
    const subskills = {
      level10: 'Helping Speed S',
      level25: 'Skill Trigger S',
      level50: 'Inventory Up S',
      level70: 'Helping Bonus',
      level80: '',
    };

    const steps = getAvailableSilverSeedUpgrades(subskills, 'skill');
    expect(steps.length).toBe(4);
    // Priority for skill: Skill Trigger S first!
    expect(steps[0].fromSkill).toBe('Skill Trigger S');
    expect(steps[0].toSkill).toBe('Skill Trigger M');
    expect(steps[0].slotKey).toBe('level25');

    // Then Helping Speed S
    expect(steps[1].fromSkill).toBe('Helping Speed S');
    expect(steps[1].toSkill).toBe('Helping Speed M');

    // Then Inventory Up S -> M, and Inventory Up M -> L
    expect(steps[2].fromSkill).toBe('Inventory Up S');
    expect(steps[2].toSkill).toBe('Inventory Up M');
    expect(steps[3].fromSkill).toBe('Inventory Up M');
    expect(steps[3].toSkill).toBe('Inventory Up L');
  });

  it('should not upgrade subskills if target tier is already present', () => {
    const subskills = {
      level10: 'Helping Speed S',
      level25: 'Helping Speed M',
      level50: 'Berry Finding S',
      level70: '',
      level80: '',
    };

    const steps = getAvailableSilverSeedUpgrades(subskills, 'berry');
    // Helping Speed S cannot be upgraded because Helping Speed M is present
    expect(steps.length).toBe(0);
  });

  it('should correctly apply partial resource investment and neutralize nature with mint', () => {
    const config = {
      speciesSpecialty: 'skill',
      rawNature: 'Quiet', // -speed for skill mon
      rawMainSkillLevel: 2,
      maxSkillLevel: 6,
      rawSubskills: {
        level10: 'Helping Speed S',
        level25: 'Skill Trigger S',
        level50: 'Helping Bonus',
        level70: '',
        level80: '',
      },
    };

    const result = applyResourceInvestment(config, {
      goldSeeds: 2,
      silverSeeds: 1,
      useMint: true,
    });

    expect(result.effectiveMainSkillLevel).toBe(4);
    expect(result.appliedGoldSeeds).toBe(2);
    // Retains rawNature as Quiet, but effectiveNature is neutralized to Bashful
    expect(result.rawNature).toBe('Quiet');
    expect(result.effectiveNature).toBe('Bashful');
    expect(result.isNatureNeutralized).toBe(true);
    expect(result.appliedMint).toBe(true);
    expect(result.appliedSilverSeeds).toBe(1);
    expect(result.effectiveSubskills.level25).toBe('Skill Trigger M');
    expect(result.effectiveSubskills.level10).toBe('Helping Speed S'); // not upgraded yet
    expect(result.isInvested).toBe(true);
  });

  it('should not apply mint if nature is already neutral', () => {
    const config = {
      speciesSpecialty: 'ingredient',
      rawNature: 'Bashful',
      rawMainSkillLevel: 1,
      maxSkillLevel: 6,
      rawSubskills: {},
    };

    const result = applyResourceInvestment(config, {
      goldSeeds: 0,
      silverSeeds: 0,
      useMint: true,
    });

    expect(result.appliedMint).toBe(false);
    expect(result.isNatureNeutralized).toBe(false);
    expect(result.effectiveNature).toBe('Bashful');
    expect(result.isInvested).toBe(false);
  });

  it('should correctly apply full resource investment (Max Benchmark)', () => {
    const config = {
      speciesSpecialty: 'ingredient',
      rawNature: 'Jolly', // -ingredient on ingredient mon!
      rawMainSkillLevel: 1,
      maxSkillLevel: 6,
      rawSubskills: {
        level10: 'Ingredient Finder S',
        level25: 'Inventory Up S',
        level50: 'Helping Speed S',
        level70: 'Helping Bonus',
        level80: '',
      },
    };

    const result = applyResourceInvestment(config, {
      goldSeeds: 99,
      silverSeeds: 99,
      useMint: true,
    });

    expect(result.effectiveMainSkillLevel).toBe(6);
    expect(result.appliedGoldSeeds).toBe(5);
    expect(result.rawNature).toBe('Jolly');
    expect(result.effectiveNature).toBe('Bashful'); // neutralized!
    expect(result.isNatureNeutralized).toBe(true);
    expect(result.effectiveSubskills.level10).toBe('Ingredient Finder M');
    expect(result.effectiveSubskills.level25).toBe('Inventory Up L');
    expect(result.effectiveSubskills.level50).toBe('Helping Speed M');
    expect(result.appliedSilverSeeds).toBe(4);
  });
});
