import { describe, it, expect } from 'vitest';
import {
  getAvailableSilverSeedUpgrades,
  applyResourceInvestment,
  getRecommendedMintNature,
} from '../rating/resourceSimulation';

describe('Resource Simulation (Gold Seeds, Silver Seeds, Nature Mints)', () => {
  it('should recommend correct mint nature based on specialty', () => {
    expect(getRecommendedMintNature('berry')).toBe('Adamant');
    expect(getRecommendedMintNature('skill')).toBe('Careful');
    expect(getRecommendedMintNature('ingredient')).toBe('Quiet');
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

  it('should correctly apply partial resource investment', () => {
    const config = {
      speciesSpecialty: 'skill',
      rawNature: 'Quiet',
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
      mintNature: 'Careful',
    });

    expect(result.effectiveMainSkillLevel).toBe(4);
    expect(result.appliedGoldSeeds).toBe(2);
    expect(result.effectiveNature).toBe('Careful');
    expect(result.appliedMint).toBe(true);
    expect(result.appliedSilverSeeds).toBe(1);
    expect(result.effectiveSubskills.level25).toBe('Skill Trigger M');
    expect(result.effectiveSubskills.level10).toBe('Helping Speed S'); // not upgraded yet
    expect(result.isInvested).toBe(true);
  });

  it('should correctly apply full resource investment (Max Benchmark)', () => {
    const config = {
      speciesSpecialty: 'ingredient',
      rawNature: 'Rash',
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
      mintNature: 'Quiet',
    });

    expect(result.effectiveMainSkillLevel).toBe(6);
    expect(result.appliedGoldSeeds).toBe(5);
    expect(result.effectiveNature).toBe('Quiet');
    expect(result.effectiveSubskills.level10).toBe('Ingredient Finder M');
    expect(result.effectiveSubskills.level25).toBe('Inventory Up L');
    expect(result.effectiveSubskills.level50).toBe('Helping Speed M');
    expect(result.appliedSilverSeeds).toBe(4);
  });
});
