import { ceil, round } from './math';

export interface BerryStrengthParams {
  baseValue: number; // Base energy value of the berry (e.g. Grepa 25, Oran 31)
  level: number; // 1 to 70
  isFavored?: boolean; // Favored berry on the current island (2x)
  favoredMultiplier?: number; // default 2.0 (or 2.4 in Expert Mode)
  mapBonus?: number; // Map field bonus percentage, 0 to 85
  eventMultiplier?: number; // default 1.0
  berryZoneMultiplier?: number; // default 1.0 (from Berry Zone skill)
}

export interface BerryStrengthResult {
  baseStrengthAtLevel: number; // Unboosted berry strength S_berry
  finalStrength: number; // S_final after island, favorite, and event multipliers
}

/**
 * Calculates base berry strength at a given level:
 * S_berry = round(max(B + L - 1, B * 1.025^(L - 1)))
 */
export function calculateBaseBerryStrength(baseValue: number, level: number): number {
  const lvl = Math.max(1, level);
  const linear = baseValue + (lvl - 1);
  const exponential = baseValue * Math.pow(1.025, lvl - 1);
  return round(Math.max(linear, exponential));
}

/**
 * Calculates final berry strength including field and island bonuses:
 * S_final = ceil(S_berry * (1 + mapBonus / 100) * favoredMultiplier * eventMultiplier * berryZoneMultiplier)
 */
export function calculateBerryStrength(params: BerryStrengthParams): BerryStrengthResult {
  const {
    baseValue,
    level,
    isFavored = false,
    favoredMultiplier = 2.0,
    mapBonus = 0,
    eventMultiplier = 1.0,
    berryZoneMultiplier = 1.0,
  } = params;

  const baseStrengthAtLevel = calculateBaseBerryStrength(baseValue, level);

  const fieldMult = 1.0 + Math.max(0, mapBonus) / 100;
  const favMult = isFavored ? favoredMultiplier : 1.0;

  const finalStrength = ceil(
    baseStrengthAtLevel * fieldMult * favMult * eventMultiplier * berryZoneMultiplier
  );

  return {
    baseStrengthAtLevel,
    finalStrength,
  };
}

