import {
  GAME_DATA,
  type PokemonSpecies,
  type Nature,
  type Subskill,
  type Ingredient,
  type Berry,
} from '@pokesleep/data';
import {
  calculateHelpingFrequency,
  calculateBerryStrength,
  calculateCarryLimit,
  calculateIngredientRate,
  calculateSkillRate,
} from '../formula';

export const SUBSKILL_UNLOCK_LEVELS = [10, 25, 50, 75, 100];

export interface IngredientSelection {
  slot0?: string;
  slot30?: string;
  slot60?: string;
}

export interface ProductionParams {
  pokemon: PokemonSpecies | string; // Species object or name
  level: number; // 1 to 70
  nature?: Nature | string | null;
  subskills?: Array<Subskill | string>;
  ingredientSelection?: IngredientSelection | string; // Object or combo like 'AAA', 'ABB'
  mainSkillLevel?: number; // 1 to 7
  ribbonLevel?: number; // 0 to 4
  goodCampTicket?: boolean;
  nrOfTeamHelpingBonus?: number;
  energyMultiplier?: number; // default 0.45
  isFavoredBerry?: boolean;
  mapBonus?: number; // 0 to 85
  withPity?: boolean; // default true
}

export interface DailyIngredientProduce {
  ingredient: string;
  longName: string;
  amount: number;
  energy: number;
}

export interface ProductionResult {
  pokemon: PokemonSpecies;
  level: number;
  nature: Nature | null;
  activeSubskills: Subskill[];
  unlockedIngredientSlots: number;
  helpingFrequency: number; // seconds
  dailyHelps: number;
  carryLimit: number;
  ingredientRate: number;
  berryRate: number;
  berriesPerDrop: number;
  berryStrength: number; // final berry strength per single berry
  dailyBerryCount: number;
  dailyBerryEnergy: number;
  dailyIngredients: DailyIngredientProduce[];
  dailyIngredientCount: number;
  dailyIngredientEnergy: number;
  skillRate: number;
  dailySkillProcs: number;
  dailySkillEnergy: number;
  totalDailyEnergy: number;
}

/**
 * Filter subskills to only those unlocked at the given level.
 */
export function getActiveSubskills(
  allSubskills: Array<Subskill | string> = [],
  level: number
): Subskill[] {
  const active: Subskill[] = [];
  allSubskills.forEach((sub, idx) => {
    const unlockLevel = SUBSKILL_UNLOCK_LEVELS[idx] ?? 100;
    if (level >= unlockLevel) {
      const subObj =
        typeof sub === 'string'
          ? GAME_DATA.subskills.find(
              s =>
                s.name.toLowerCase() === sub.toLowerCase() ||
                s.shortName.toLowerCase() === sub.toLowerCase() ||
                s.translations['zh-CN'].toLowerCase() === sub.toLowerCase()
            )
          : sub;
      if (subObj) active.push(subObj);
    }
  });
  return active;
}

/**
 * Resolve ingredient combo from string (e.g. 'AAA', 'ABC') or selection object.
 */
export function resolveIngredientsForSlots(
  mon: PokemonSpecies,
  selection?: IngredientSelection | string
): { slot0: { ingredient: string; amount: number }; slot30?: { ingredient: string; amount: number }; slot60?: { ingredient: string; amount: number } } {
  const slot0List = mon.ingredient0 || [];
  const slot30List = mon.ingredient30 || [];
  const slot60List = mon.ingredient60 || [];

  // Default selection is first item in each slot
  let s0 = slot0List[0] || { ingredient: 'Apple', amount: 1 };
  let s30 = slot30List.find(i => i.ingredient !== 'Locked') || slot30List[0];
  let s60 = slot60List.find(i => i.ingredient !== 'Locked') || slot60List[0];

  if (typeof selection === 'string' && selection.length >= 1) {
    const code = selection.toUpperCase();
    // A -> index 0, B -> index 1, C -> index 2
    const letterToIndex = (ch: string) => Math.max(0, ch.charCodeAt(0) - 65);
    const i0 = letterToIndex(code[0]);
    if (slot0List[i0]) s0 = slot0List[i0];

    if (code.length >= 2) {
      const i30 = letterToIndex(code[1]);
      const valid30 = slot30List.filter(i => i.ingredient !== 'Locked');
      if (valid30[i30]) s30 = valid30[i30];
    }

    if (code.length >= 3) {
      const i60 = letterToIndex(code[2]);
      const valid60 = slot60List.filter(i => i.ingredient !== 'Locked');
      if (valid60[i60]) s60 = valid60[i60];
    }
  } else if (typeof selection === 'object' && selection !== null) {
    if (selection.slot0) {
      const match = slot0List.find(i => i.ingredient.toLowerCase() === selection.slot0?.toLowerCase());
      if (match) s0 = match;
    }
    if (selection.slot30) {
      const match = slot30List.find(i => i.ingredient.toLowerCase() === selection.slot30?.toLowerCase());
      if (match) s30 = match;
    }
    if (selection.slot60) {
      const match = slot60List.find(i => i.ingredient.toLowerCase() === selection.slot60?.toLowerCase());
      if (match) s60 = match;
    }
  }

  return { slot0: s0, slot30: s30, slot60: s60 };
}

/**
 * Calculates estimated skill energy value for L1 single-pokemon rating.
 */
export function estimateSkillEnergy(
  mon: PokemonSpecies,
  dailySkillProcs: number,
  mainSkillLevel: number = 1,
  mapBonus: number = 0
): number {
  if (dailySkillProcs <= 0) return 0;
  const skillName = mon.skill.baseSkillName || mon.skill.name;
  const levelIdx = Math.max(0, Math.min(mainSkillLevel - 1, (mon.skill.RP?.length || 6) - 1));
  const fieldMult = 1.0 + Math.max(0, mapBonus) / 100;

  // Charge Strength S / M
  if (skillName.includes('Charge Strength')) {
    const strengthAmounts = mon.skill.strengthAmounts || mon.skill.RP || [400, 569, 785, 1083, 1496, 2066, 3000];
    const amount = strengthAmounts[levelIdx] ?? 400;
    return dailySkillProcs * amount * fieldMult;
  }

  // Ingredient Magnet S
  if (skillName.includes('Ingredient Magnet')) {
    const magnetAmounts = [6, 8, 11, 14, 17, 21];
    const count = magnetAmounts[Math.min(levelIdx, magnetAmounts.length - 1)] ?? 6;
    const avgIngredientEnergy = 115 * fieldMult;
    return dailySkillProcs * count * avgIngredientEnergy;
  }

  // Cooking Power-Up S (allows bigger pot -> higher recipe/filler energy)
  if (skillName.includes('Cooking Power-Up')) {
    const potAmounts = [7, 10, 14, 18, 22, 27];
    const potBoost = potAmounts[Math.min(levelIdx, potAmounts.length - 1)] ?? 7;
    return dailySkillProcs * potBoost * 115 * fieldMult;
  }

  // Energy For Everyone S (heals team, in solo evaluation valued by energy maintenance)
  if (skillName.includes('Energy For Everyone')) {
    const healAmounts = [5, 7, 9, 11, 15, 18];
    const heal = healAmounts[Math.min(levelIdx, healAmounts.length - 1)] ?? 5;
    // Estimated equivalent energy contribution
    return dailySkillProcs * heal * 150 * fieldMult;
  }

  // Default fallback estimation based on skill RP tier
  const baseRp = mon.skill.RP?.[levelIdx] ?? 400;
  return dailySkillProcs * baseRp * fieldMult;
}

/**
 * Calculates complete L1 single-Pokémon daily expected production.
 */
export function calculateDailyProduction(params: ProductionParams): ProductionResult {
  const {
    pokemon: rawPokemon,
    level,
    nature: rawNature,
    subskills: rawSubskills = [],
    ingredientSelection,
    mainSkillLevel = 1,
    ribbonLevel = 0,
    goodCampTicket = false,
    nrOfTeamHelpingBonus = 0,
    energyMultiplier = 0.45,
    isFavoredBerry = false,
    mapBonus = 0,
    withPity = true,
  } = params;

  // Resolve Pokémon species
  const mon: PokemonSpecies | undefined =
    typeof rawPokemon === 'string'
      ? GAME_DATA.pokemon.find(
          p =>
            p.name.toUpperCase() === rawPokemon.toUpperCase() ||
            p.displayName.toLowerCase() === rawPokemon.toLowerCase() ||
            p.translations['zh-CN'] === rawPokemon
        )
      : rawPokemon;

  if (!mon) {
    throw new Error(`Pokemon species not found: ${rawPokemon}`);
  }

  // Resolve Nature
  let nature: Nature | null = null;
  if (rawNature) {
    nature =
      typeof rawNature === 'string'
        ? GAME_DATA.natures.find(
            n =>
              n.name.toLowerCase() === rawNature.toLowerCase() ||
              n.translations['zh-CN'] === rawNature
          ) || null
        : rawNature;
  }

  // 1. Filter active subskills for current level
  const activeSubskills = getActiveSubskills(rawSubskills, level);

  // 2. Helping Frequency & Daily Helps
  const freqResult = calculateHelpingFrequency({
    baseFrequency: mon.frequency,
    level,
    nature,
    subskills: activeSubskills,
    nrOfTeamHelpingBonus,
    ribbonLevel,
    remainingEvolutions: mon.remainingEvolutions,
    goodCampTicket,
    energyMultiplier,
  });

  const dailyHelps = 86400 / freqResult.frequency;

  // 3. Carry Limit
  const carryResult = calculateCarryLimit({
    baseCarrySize: mon.carrySize,
    previousEvolutions: mon.previousEvolutions,
    subskills: activeSubskills,
    ribbonLevel,
    goodCampTicket,
  });

  // 4. Ingredient Rate & Berry Rate
  const ingredientRate = calculateIngredientRate({
    baseIngredientPercentage: mon.ingredientPercentage,
    nature,
    subskills: activeSubskills,
  });
  const berryRate = 1.0 - ingredientRate;

  // 5. Berries Production
  const hasBfs = activeSubskills.some(
    s => s.name.toLowerCase() === 'berry finding s' || s.shortName.toLowerCase() === 'bfs'
  );
  const isBerrySpecialist = mon.specialty === 'berry' || mon.specialty === 'all';
  const berriesPerDrop = (isBerrySpecialist ? 2 : 1) + (hasBfs ? 1 : 0);

  const berryObj = GAME_DATA.berries.find(b => b.name.toUpperCase() === mon.berry.toUpperCase());
  const berryBaseValue = berryObj ? berryObj.value : 25;

  const berryStrengthResult = calculateBerryStrength({
    baseValue: berryBaseValue,
    level,
    isFavored: isFavoredBerry,
    mapBonus,
  });

  const dailyBerryHelps = dailyHelps * berryRate;
  const dailyBerryCount = dailyBerryHelps * berriesPerDrop;
  const dailyBerryEnergy = dailyBerryCount * berryStrengthResult.finalStrength;

  // 6. Ingredients Production
  const resolvedSlots = resolveIngredientsForSlots(mon, ingredientSelection);
  const unlockedSlots: Array<{ ingredient: string; amount: number }> = [resolvedSlots.slot0];
  if (level >= 30 && resolvedSlots.slot30) unlockedSlots.push(resolvedSlots.slot30);
  if (level >= 60 && resolvedSlots.slot60) unlockedSlots.push(resolvedSlots.slot60);

  const dailyIngredientHelps = dailyHelps * ingredientRate;
  const slotWeight = 1.0 / unlockedSlots.length;

  const ingredientMap = new Map<string, { amount: number; value: number; longName: string }>();

  for (const slot of unlockedSlots) {
    const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === slot.ingredient.toLowerCase());
    const ingVal = ingObj ? ingObj.value : 100;
    const longName = ingObj ? ingObj.longName : slot.ingredient;

    const existing = ingredientMap.get(slot.ingredient) || { amount: 0, value: ingVal, longName };
    existing.amount += dailyIngredientHelps * slotWeight * slot.amount;
    ingredientMap.set(slot.ingredient, existing);
  }

  const mapMult = 1.0 + Math.max(0, mapBonus) / 100;
  let dailyIngredientCount = 0;
  let dailyIngredientEnergy = 0;
  const dailyIngredients: DailyIngredientProduce[] = [];

  for (const [ingName, ingData] of ingredientMap.entries()) {
    const energy = ingData.amount * ingData.value * mapMult;
    dailyIngredientCount += ingData.amount;
    dailyIngredientEnergy += energy;
    dailyIngredients.push({
      ingredient: ingName,
      longName: ingData.longName,
      amount: ingData.amount,
      energy,
    });
  }

  // 7. Skill Procs & Skill Energy
  const skillProcResult = calculateSkillRate({
    baseSkillPercentage: mon.skillPercentage,
    pityProcThreshold: mon.pityProcThreshold,
    nature,
    subskills: activeSubskills,
    withPity,
  });

  const dailySkillProcs = dailyHelps * skillProcResult.effectiveRate;
  const dailySkillEnergy = estimateSkillEnergy(mon, dailySkillProcs, mainSkillLevel, mapBonus);

  // 8. Total Daily Energy
  const totalDailyEnergy = dailyBerryEnergy + dailyIngredientEnergy + dailySkillEnergy;

  return {
    pokemon: mon,
    level,
    nature,
    activeSubskills,
    unlockedIngredientSlots: unlockedSlots.length,
    helpingFrequency: freqResult.frequency,
    dailyHelps,
    carryLimit: carryResult.totalCarryLimit,
    ingredientRate,
    berryRate,
    berriesPerDrop,
    berryStrength: berryStrengthResult.finalStrength,
    dailyBerryCount,
    dailyBerryEnergy,
    dailyIngredients,
    dailyIngredientCount,
    dailyIngredientEnergy,
    skillRate: skillProcResult.effectiveRate,
    dailySkillProcs,
    dailySkillEnergy,
    totalDailyEnergy,
  };
}

