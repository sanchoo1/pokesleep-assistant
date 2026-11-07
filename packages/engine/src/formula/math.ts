/**
 * Precision Math Utilities for Game Formula Calculations
 * Handles IEEE-754 floating point precision corrections.
 */

export function floorWithIEEE754Correction(num: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  const shifted = num * factor;
  const rounded = Math.abs(shifted - Math.round(shifted)) < 1e-10 ? Math.round(shifted) : shifted;
  return Math.floor(rounded) / factor;
}

export function round(num: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

export function ceil(num: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(num * factor) / factor;
}
