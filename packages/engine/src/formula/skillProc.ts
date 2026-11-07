import type { Nature, Subskill } from '@pokesleep/data';
import { round } from './math';

export interface IngredientRateParams {
  baseIngredientPercentage: number; // e.g. 20.7
  nature?: Nature | null;
  subskills?: Array<Subskill | string>;
}

export interface SkillRateParams {
  baseSkillPercentage: number; // e.g. 2.1
  pityProcThreshold?: number; // e.g. 78
  nature?: Nature | null;
  subskills?: Array<Subskill | string>;
  withPity?: boolean; // default true
}

export interface SkillRateResult {
  baseRate: number; // Base rate as decimal (e.g. 0.021)
  natureMultiplier: number;
  subskillMultiplier: number;
  rateWithoutPity: number;
  rateWithPity: number;
  effectiveRate: number;
}

export function calculateIngredientSubskillMultiplier(subskills: Array<Subskill | string> = []): number {
  const subNames = new Set(
    subskills.map(s => (typeof s === 'string' ? s.toLowerCase() : s.name.toLowerCase()))
  );
  let bonus = 0;
  if (subNames.has('ingredient finder s') || subNames.has('ing s')) bonus += 0.18;
  if (subNames.has('ingredient finder m') || subNames.has('ing m')) bonus += 0.36;
  return round(1.0 + bonus, 2);
}

export function calculateSkillSubskillMultiplier(subskills: Array<Subskill | string> = []): number {
  const subNames = new Set(
    subskills.map(s => (typeof s === 'string' ? s.toLowerCase() : s.name.toLowerCase()))
  );
  let bonus = 0;
  if (subNames.has('skill trigger s') || subNames.has('trigger s')) bonus += 0.18;
  if (subNames.has('skill trigger m') || subNames.has('trigger m')) bonus += 0.36;
  return round(1.0 + bonus, 2);
}

/**
 * Calculates effective ingredient drop probability (0.0 to 1.0)
 */
export function calculateIngredientRate(params: IngredientRateParams): number {
  const { baseIngredientPercentage, nature, subskills = [] } = params;
  const natureMult = nature?.modifiers?.ingredient ?? 1.0;
  const subskillMult = calculateIngredientSubskillMultiplier(subskills);

  const rate = (baseIngredientPercentage / 100) * natureMult * subskillMult;
  return Math.min(1.0, Math.max(0.0, rate));
}

/**
 * Calculates effective skill trigger probability (0.0 to 1.0) with or without pity proc:
 * R' = R / (1 - (1 - R)^(N + 1))
 */
export function calculateSkillRate(params: SkillRateParams): SkillRateResult {
  const {
    baseSkillPercentage,
    pityProcThreshold = 78,
    nature,
    subskills = [],
    withPity = true,
  } = params;

  const baseRate = baseSkillPercentage / 100;
  const natureMultiplier = nature?.modifiers?.skill ?? 1.0;
  const subskillMultiplier = calculateSkillSubskillMultiplier(subskills);

  const rateWithoutPity = Math.min(1.0, Math.max(0.0, baseRate * natureMultiplier * subskillMultiplier));

  let rateWithPity = rateWithoutPity;
  if (pityProcThreshold > 0 && rateWithoutPity > 0 && rateWithoutPity < 1.0) {
    const denominator = 1.0 - Math.pow(1.0 - rateWithoutPity, pityProcThreshold + 1);
    if (denominator > 0) {
      rateWithPity = rateWithoutPity / denominator;
    }
  }

  const effectiveRate = withPity ? rateWithPity : rateWithoutPity;

  return {
    baseRate,
    natureMultiplier,
    subskillMultiplier,
    rateWithoutPity,
    rateWithPity,
    effectiveRate,
  };
}

