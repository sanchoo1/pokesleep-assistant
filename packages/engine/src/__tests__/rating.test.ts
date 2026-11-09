import { describe, it, expect } from 'vitest';
import { ratePokemon } from '../rating';

describe('Rating: Rate My Pokémon Evaluator', () => {
  it('should assign high PR to a top-tier god-roll Pikachu', () => {
    // God-roll: Adamant (+speed), BFS, Helping Speed M
    const result = ratePokemon({
      pokemon: 'PIKACHU',
      level: 30,
      nature: 'Adamant',
      subskills: ['Berry Finding S', 'Helping Speed M'],
      ingredientSelection: 'AAA',
    });

    expect(result.percentile).toBeGreaterThanOrEqual(85);
    expect(result.percentagePosition).toBeGreaterThanOrEqual(70);
    expect(result.relativeGain).toBeGreaterThan(30); // At least +30% stronger than neutral baseline
    expect(result.bestScore).toBeGreaterThanOrEqual(result.currentScore);
    expect(result.currentScore).toBeGreaterThan(result.worstScore);
  });

  it('should assign low PR to a poor-roll Pikachu with anti-synergistic stats', () => {
    // Poor roll: Modest (-speed +ing on berry specialist), no speed or BFS subskills
    const result = ratePokemon({
      pokemon: 'PIKACHU',
      level: 30,
      nature: 'Modest',
      subskills: ['Research EXP Bonus', 'Sleep EXP Bonus'],
      ingredientSelection: 'AAA',
    });

    expect(result.percentile).toBeLessThanOrEqual(30);
    expect(result.percentagePosition).toBeLessThanOrEqual(30);
  });

  it('should identify best and worst combinations', () => {
    const result = ratePokemon({
      pokemon: 'RAICHU',
      level: 30,
      nature: 'Hardy',
      subskills: ['Helping Speed S'],
    });

    expect(result.bestCombination.score).toBeGreaterThan(result.worstCombination.score);
    expect(result.bestCombination.subskillNames.length).toBeGreaterThan(0);
    expect(result.worstCombination.subskillNames.length).toBeGreaterThan(0);
  });

  it('should evaluate 7 progression milestones including Lv.80 when previewLv80 is enabled', async () => {
    const { evaluatePokemonMilestones } = await import('../rating');
    const report = evaluatePokemonMilestones({
      pokemon: 'PIKACHU',
      nature: 'Adamant',
      subskills: {
        level10: 'Helping Speed S',
        level25: 'Inventory Up S',
        level50: 'Inventory Up M',
        level70: 'Berry Finding S',
        level80: 'Helping Speed M',
      },
      previewLv80: true,
    });

    expect(report.milestones.map((m) => m.level)).toEqual([10, 25, 30, 50, 60, 70, 80]);
    const m80 = report.milestones.find((m) => m.level === 80);
    expect(m80).toBeDefined();
    expect(m80!.unlockNote).toContain('未来前瞻');
    expect(m80!.rating.currentProduction.activeSubskills.length).toBe(5);
    expect(m80!.rating.currentProduction.activeSubskills.map((s) => s.name)).toContain('Helping Speed M');
  });
});

