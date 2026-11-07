import { ceil, round } from './math';

export interface PotCapacityParams {
  basePotSize: number; // 21 to 81
  isSunday?: boolean; // Sunday pot size is 2x
  cookingPowerUpBonus?: number; // Added capacity from Cooking Power-Up S skill
  goodCampTicket?: boolean; // Good Camp Ticket multiplies pot capacity by 1.5
  eventMultiplier?: number; // Event multiplier on base pot size (default 1.0)
}

export interface PotCapacityResult {
  basePotSize: number;
  sundayMultiplier: number;
  campMultiplier: number;
  skillBonus: number;
  totalCapacity: number;
}

/**
 * Calculates current pot capacity according to:
 * round(((ceil(P_B * M_E * M_Sun) + P_skill) * M_GCT))
 */
export function calculatePotCapacity(params: PotCapacityParams): PotCapacityResult {
  const {
    basePotSize,
    isSunday = false,
    cookingPowerUpBonus = 0,
    goodCampTicket = false,
    eventMultiplier = 1.0,
  } = params;

  const sundayMultiplier = isSunday ? 2.0 : 1.0;
  const campMultiplier = goodCampTicket ? 1.5 : 1.0;
  const skillBonus = Math.max(0, cookingPowerUpBonus);

  const expandedBase = ceil(basePotSize * eventMultiplier * sundayMultiplier);
  const totalCapacity = round((expandedBase + skillBonus) * campMultiplier);

  return {
    basePotSize,
    sundayMultiplier,
    campMultiplier,
    skillBonus,
    totalCapacity,
  };
}

