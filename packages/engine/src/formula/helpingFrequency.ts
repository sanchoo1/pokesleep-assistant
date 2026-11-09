import type { Nature, Subskill } from '@pokesleep/data';
import { floorWithIEEE754Correction, round } from './math';

export type HelpingBonusMode = 'individual25' | 'teamSolo5';

export interface HelpingFrequencyParams {
  baseFrequency: number; // in seconds
  level: number; // 1 to 70
  nature?: Nature | null;
  subskills?: Array<Subskill | string>;
  nrOfTeamHelpingBonus?: number; // 0 to 5
  ribbonLevel?: number; // 0 to 4
  remainingEvolutions?: number; // 0, 1, or 2
  goodCampTicket?: boolean;
  energyMultiplier?: number; // default 0.45 (>= 80% energy optimistic)
  helpingBonusMode?: HelpingBonusMode;
}

export interface HelpingFrequencyResult {
  frequency: number; // Final helping interval in seconds (floored)
  levelFactor: number;
  natureFactor: number;
  subskillFactor: number;
  ribbonFactor: number;
  campFactor: number;
  energyFactor: number;
  combinedMultiplier: number;
}

export function calculateRibbonFrequencyFactor(
  ribbonLevel: number = 0,
  remainingEvolutions: number = 0
): number {
  let factor = 1.0;
  if (ribbonLevel >= 2) {
    if (remainingEvolutions === 1) factor -= 0.05;
    else if (remainingEvolutions === 2) factor -= 0.11;
  }
  if (ribbonLevel >= 4) {
    if (remainingEvolutions === 1) factor -= 0.07;
    else if (remainingEvolutions === 2) factor -= 0.14;
  }
  return round(factor, 3);
}

export function calculateNatureSpeedFactor(nature?: Nature | null): number {
  if (!nature) return 1.0;
  if (nature.positiveModifier === 'speed') return 0.9;
  if (nature.negativeModifier === 'speed') return 1.075;
  return 1.0;
}

export function calculateSubskillSpeedFactor(
  subskills: Array<Subskill | string> = [],
  nrOfTeamHelpingBonus: number = 0
): number {
  const subNames = new Set(
    subskills.map(s => (typeof s === 'string' ? s.toLowerCase() : s.name.toLowerCase()))
  );

  let speedSum = 0;
  if (subNames.has('helping speed s') || subNames.has('help s')) speedSum += 0.07;
  if (subNames.has('helping speed m') || subNames.has('help m')) speedSum += 0.14;

  const hasHb = subNames.has('helping bonus') || subNames.has('hb');
  const totalHb = hasHb ? nrOfTeamHelpingBonus + 1 : nrOfTeamHelpingBonus;
  speedSum += 0.05 * Math.min(5, totalHb);

  // Maximum personal subskill helping speed boost is capped at 35% (multiplier minimum 0.65)
  const cappedBonus = Math.min(0.35, speedSum);
  return round(1.0 - cappedBonus, 2);
}

/**
 * Calculates Pokémon helping interval according to the official formula:
 * F = floor(F_B * rounddown(M, 4))
 */
export function calculateHelpingFrequency(params: HelpingFrequencyParams): HelpingFrequencyResult {
  const {
    baseFrequency,
    level,
    nature,
    subskills = [],
    nrOfTeamHelpingBonus = 0,
    ribbonLevel = 0,
    remainingEvolutions = 0,
    goodCampTicket = false,
    energyMultiplier = 0.45,
  } = params;

  // 1. Level reduction: 0.2% per level above 1
  const levelFactor = 1.0 - 0.002 * (Math.max(1, level) - 1);

  // 2. Nature speed modifier
  const natureFactor = calculateNatureSpeedFactor(nature);

  // 3. Subskills + Team Helping Bonus
  const subskillFactor = calculateSubskillSpeedFactor(subskills, nrOfTeamHelpingBonus);

  // 4. Good Night Ribbon factor
  const ribbonFactor = calculateRibbonFrequencyFactor(ribbonLevel, remainingEvolutions);

  // 5. Good Camp Ticket (0.8 multiplier = 20% speedup)
  const campFactor = goodCampTicket ? 0.8 : 1.0;

  // 6. Energy multiplier
  const energyFactor = energyMultiplier;

  // Combined multiplier M rounded down to 4 decimal places
  const rawM = levelFactor * natureFactor * subskillFactor * ribbonFactor * campFactor * energyFactor;
  const combinedMultiplier = floorWithIEEE754Correction(rawM, 4);

  // Final interval in seconds
  const frequency = Math.floor(baseFrequency * combinedMultiplier);

  return {
    frequency,
    levelFactor,
    natureFactor,
    subskillFactor,
    ribbonFactor,
    campFactor,
    energyFactor,
    combinedMultiplier,
  };
}

