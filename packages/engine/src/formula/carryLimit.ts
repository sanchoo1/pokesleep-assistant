import type { Subskill } from '@pokesleep/data';
import { ceil } from './math';

export interface CarryLimitParams {
  baseCarrySize: number;
  previousEvolutions?: number; // 0, 1, or 2 (+5 carry size per evolution)
  subskills?: Array<Subskill | string>;
  ribbonLevel?: number; // 0 to 4
  goodCampTicket?: boolean; // Good Camp Ticket gives 1.2x carry size
}

export interface CarryLimitResult {
  baseWithEvolutions: number;
  subskillBonus: number;
  ribbonBonus: number;
  campMultiplier: number;
  totalCarryLimit: number;
}

export function calculateRibbonCarryBonus(ribbonLevel: number = 0): number {
  if (ribbonLevel <= 0) return 0;
  if (ribbonLevel === 1) return 1;
  if (ribbonLevel === 2) return 3;
  if (ribbonLevel === 3) return 6;
  return 8; // ribbonLevel >= 4
}

export function calculateSubskillCarryBonus(subskills: Array<Subskill | string> = []): number {
  const subNames = new Set(
    subskills.map(s => (typeof s === 'string' ? s.toLowerCase() : s.name.toLowerCase()))
  );

  let bonus = 0;
  if (subNames.has('inventory up s') || subNames.has('inv s')) bonus += 6;
  if (subNames.has('inventory up m') || subNames.has('inv m')) bonus += 12;
  if (subNames.has('inventory up l') || subNames.has('inv l')) bonus += 18;
  return bonus;
}

/**
 * Calculates max inventory carry limit according to:
 * ceil((C_B + 5 * evolutions + C_subskill + C_ribbon) * (camp ? 1.2 : 1.0))
 */
export function calculateCarryLimit(params: CarryLimitParams): CarryLimitResult {
  const {
    baseCarrySize,
    previousEvolutions = 0,
    subskills = [],
    ribbonLevel = 0,
    goodCampTicket = false,
  } = params;

  const baseWithEvolutions = baseCarrySize + 5 * Math.max(0, previousEvolutions);
  const subskillBonus = calculateSubskillCarryBonus(subskills);
  const ribbonBonus = calculateRibbonCarryBonus(ribbonLevel);
  const campMultiplier = goodCampTicket ? 1.2 : 1.0;

  const totalCarryLimit = ceil((baseWithEvolutions + subskillBonus + ribbonBonus) * campMultiplier);

  return {
    baseWithEvolutions,
    subskillBonus,
    ribbonBonus,
    campMultiplier,
    totalCarryLimit,
  };
}
