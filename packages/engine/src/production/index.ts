import {
  GAME_DATA,
  type PokemonSpecies,
  type Nature,
  type Subskill,
  type MainskillUnit,
} from '@pokesleep/data';
import {
  calculateHelpingFrequency,
  calculateBerryStrength,
  calculateCarryLimit,
  calculateIngredientRate,
  calculateSkillRate,
  calculateRP,
} from '../formula';

/**
 * Current game version subskill unlock levels:
 * Slot 1: Lv.10, Slot 2: Lv.25, Slot 3: Lv.50, Slot 4: Lv.70, Slot 5: Lv.80.
 * Current game max Pokémon level cap is Lv.70 (so up to 4 subskills can be unlocked).
 */
export const SUBSKILL_UNLOCK_LEVELS = [10, 25, 50, 70, 80] as const;
export const MAX_POKEMON_LEVEL = 70;
export const MAX_PREVIEW_POKEMON_LEVEL = 80;
export const EVALUATION_MILESTONE_LEVELS_STANDARD = [10, 25, 30, 50, 60, 70] as const;
export const EVALUATION_MILESTONE_LEVELS_PREVIEW = [10, 25, 30, 50, 60, 70, 80] as const;
export const EVALUATION_MILESTONE_LEVELS = EVALUATION_MILESTONE_LEVELS_STANDARD;

export interface SubskillSlotsMap {
  level10?: Subskill | string | null;
  level25?: Subskill | string | null;
  level50?: Subskill | string | null;
  level70?: Subskill | string | null;
  level80?: Subskill | string | null;
  /** Legacy compatibility keys */
  level75?: Subskill | string | null;
  level100?: Subskill | string | null;
}

export type SubskillsInput = Array<Subskill | string | null | undefined> | SubskillSlotsMap;

export interface IngredientSelection {
  slot0?: string;
  slot30?: string;
  slot60?: string;
}

/**
 * Flexible cooking context to replace generic coefficients with precise scenario metrics.
 */
export interface CookingScenarioContext {
  scenarioName?: string;
  dishEnergyBaseline?: number; // e.g. 35,000 standard, 55,000 for 77-recipes, 80,000 for mega meals
  fillerEnergyPerSlot?: number; // e.g. 135 standard, 140 for Corn, 185 for Leek, 342 for Slowpoke Tail
  recipeMultiplier?: number; // e.g. 1.0 Lv1, 1.35 Lv30, 1.48 Lv60
}

export interface OvernightAnalysisResult {
  sleepHours: number;
  carryLimit: number;
  timeToFullHours: number;
  isFullDuringSleep: boolean;
  timeInSneakySnackHours: number;
  normalHelps: number;
  sneakySnackHelps: number;
  normalBerries: number;
  sneakySnackBerries: number;
  totalOvernightBerries: number;
  overnightIngredients: number;
  overnightSkillProcs: number;
  normalEnergy: number;
  sneakySnackEnergy: number;
  totalOvernightEnergy: number;
  idealOvernightEnergy: number;
  efficiencyRatio: number; // totalOvernightEnergy / idealOvernightEnergy
  lostIngredients: number;
  lostSkillProcs: number;
  daytimeCollectionRecommendation: string;
}

export interface ProductionParams {
  pokemon: PokemonSpecies | string; // Species object or name
  level: number; // 1 to 80
  nature?: Nature | string | null;
  subskills?: SubskillsInput;
  ingredientSelection?: IngredientSelection | string; // Object or combo like 'AAA', 'ABB'
  mainSkillLevel?: number; // Base skill level (1 to maxLevel)
  applySkillLevelUpSubskills?: boolean; // default true: adds +1/+2 from unlocked Skill Level Up S/M
  ribbonLevel?: number; // 0 to 4
  goodCampTicket?: boolean;
  nrOfTeamHelpingBonus?: number;
  energyMultiplier?: number; // default 0.45 (>=80% energy)
  isFavoredBerry?: boolean;
  mapBonus?: number; // 0 to 85
  withPity?: boolean; // default true
  cookingContext?: CookingScenarioContext;
  sleepHours?: number; // default 8.5
  allowPreviewLv80?: boolean;
  mewLearnedSkill?: string; // Mew's Versatile learned skill via Eureka Seed (e.g. 'Energy For Everyone S')
}

export interface MewLearnedSkillMeta {
  id: string;
  name: string;
  nameZh: string;
  nameJa: string;
  role: string;
  roleType: 'healer' | 'ingredient' | 'strength' | 'pot' | 'crit' | 'helps' | 'berries' | 'shards' | 'random';
  description: string;
}

export const MEW_LEARNED_SKILLS: MewLearnedSkillMeta[] = [
  {
    id: 'Energy For Everyone S',
    name: 'Energy For Everyone S',
    nameZh: '活力疗愈S (E4E 全队奶妈)',
    nameJa: 'げんきオールS',
    role: '团队奶妈 / 全队活力续航',
    roleType: 'healer',
    description: '为全队所有成员回复大量活力，维持全队全天处于 >80% 活力的极速帮忙区间。',
  },
  {
    id: 'Ingredient Magnet S',
    name: 'Ingredient Magnet S',
    nameZh: '食材获取S (海量食材补给)',
    nameJa: '食材ゲットS',
    role: '全局食材补给 / 顶级填锅',
    roleType: 'ingredient',
    description: '随机获取海量各类食材，极大丰富食材库并支持高级食谱烹饪。',
  },
  {
    id: 'Charge Strength M',
    name: 'Charge Strength M',
    nameZh: '能量填充M (高额能量爆发)',
    nameJa: 'エナジーチャージM',
    role: '强力能量爆发 / 纯卡比兽能量',
    roleType: 'strength',
    description: '直接为卡比兽注入超高额能量，爆发力极强。',
  },
  {
    id: 'Cooking Power-Up S',
    name: 'Cooking Power-Up S',
    nameZh: '料理强化S (大锅扩容)',
    nameJa: '料理パワーアップS',
    role: '扩锅辅助 / 烹饪极限大菜',
    roleType: 'pot',
    description: '大幅扩张下一次料理的锅容量，助攻制作 77+ 或更高容量的顶级大菜。',
  },
  {
    id: 'Tasty Chance S',
    name: 'Tasty Chance S',
    nameZh: '料理成功S (暴击率提升)',
    nameJa: 'おてつだいブーストS',
    role: '烹饪暴击提升 / 料理爆击',
    roleType: 'crit',
    description: '提升下一次料理的大成功（暴击）概率，每次未暴击持续累加直至爆发。',
  },
  {
    id: 'Extra Helpful S',
    name: 'Extra Helpful S',
    nameZh: '帮手支援S (队员瞬间帮忙)',
    nameJa: 'おてつだいサポートS',
    role: '即时帮忙协助 / 队员加速',
    roleType: 'helps',
    description: '瞬间使队伍中随机一名队员产生多次瞬间帮忙，获取该队员的树果与食材。',
  },
  {
    id: 'Berry Burst',
    name: 'Berry Burst',
    nameZh: '树果遽增 (树果喷发)',
    nameJa: 'ばけのかわ（きのみバースト）',
    role: '树果喷发 / 瞬间能量',
    roleType: 'berries',
    description: '自身及全队立刻获得额外树果掉落，直接转化为卡比兽能量。',
  },
  {
    id: 'Charge Strength S',
    name: 'Charge Strength S',
    nameZh: '能量填充S (基础能量)',
    nameJa: 'エナジーチャージS',
    role: '基础能量填充',
    roleType: 'strength',
    description: '为卡比兽增加稳定基础能量。',
  },
  {
    id: 'Dream Shard Magnet S',
    name: 'Dream Shard Magnet S',
    nameZh: '梦之碎片获取S (碎片收益)',
    nameJa: 'ゆめのかけらゲットS',
    role: '资源收益 / 梦之碎片',
    roleType: 'shards',
    description: '每次发动获得大量梦之碎片，适用于培养升级与高阶活动筹备。',
  },
  {
    id: 'Energizing Cheer S',
    name: 'Energizing Cheer S',
    nameZh: '活力加油S (单体大回体)',
    nameJa: 'げんきエールS',
    role: '单体紧急救急',
    roleType: 'healer',
    description: '随机为队伍中活力最低的一只宝可梦回复超高额活力。',
  },
  {
    id: 'Charge Energy S',
    name: 'Charge Energy S',
    nameZh: '活力填充S (自身自愈)',
    nameJa: 'げんきチャージS',
    role: '自身持续满活力',
    roleType: 'healer',
    description: '为梦幻自身回复大量活力，保障梦幻自身全天满状态。',
  },
  {
    id: 'Metronome',
    name: 'Metronome',
    nameZh: '挥指 (初始默认随机技能)',
    nameJa: 'ゆびをふる',
    role: '随机挥指 / 初始白板',
    roleType: 'random',
    description: '刚获得梦幻时的初始技能，随机施展全游戏中任意一个技能的效果。',
  },
];

export interface DailyIngredientProduce {
  ingredient: string;
  longName: string;
  amount: number;
  energy: number;
}

export interface SkillActivationBreakdownItem {
  key: string;
  unit: MainskillUnit;
  perProcSelf: number;
  perProcTeamEach: number;
  dailySelf: number;
  dailyTeamTotal: number;
  estimatedDailyEnergy: number;
}

export interface SkillActivationSummary {
  skillName: string;
  baseSkillName: string;
  baseSkillLevel: number;
  skillLevelUpBonus: number;
  effectiveSkillLevel: number;
  maxSkillLevel: number;
  baseTriggerRate: number;
  modifiedTriggerRate: number; // without pity
  effectiveTriggerRate: number; // with pity (if enabled)
  pityProcThreshold: number;
  dailySkillProcs: number;
  primaryUnit: MainskillUnit;
  perProcOutput: number;
  dailyOutput: number;
  perProcTeamTotalOutput: number;
  dailyTeamTotalOutput: number;
  description: string;
  activations: SkillActivationBreakdownItem[];
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
  hoursToFullCarry: number;
  ingredientRate: number;
  berryRate: number;
  berriesPerDrop: number;
  berryStrength: number; // final berry strength per single berry
  dailyBerryCount: number;
  dailyBerryEnergy: number;
  sneakySnackingDailyEnergy: number; // 100% berry drops when inventory full
  dailyIngredients: DailyIngredientProduce[];
  dailyIngredientCount: number;
  dailyIngredientEnergy: number;
  skillDailyIngredients: DailyIngredientProduce[];
  skillDailyIngredientCount: number;
  skillDailyIngredientEnergy: number;
  combinedDailyIngredients: DailyIngredientProduce[];
  combinedDailyIngredientCount: number;
  skillRate: number;
  baseSkillRate: number;
  skillRateWithoutPity: number;
  effectiveMainSkillLevel: number;
  skillLevelUpBonus: number;
  dailySkillProcs: number;
  dailySkillEnergy: number;
  skillActivationDetails: SkillActivationSummary;
  totalDailyEnergy: number;
  rp: number;
  overnightAnalysis: OvernightAnalysisResult;
}

export function resolveSubskillObject(sub: Subskill | string | null | undefined): Subskill | null {
  if (!sub) return null;
  if (typeof sub !== 'string') return sub;
  const clean = sub.trim().toLowerCase();
  if (!clean) return null;
  return (
    GAME_DATA.subskills.find(
      s =>
        s.name.toLowerCase() === clean ||
        s.shortName.toLowerCase() === clean ||
        s.translations['zh-CN'].toLowerCase() === clean ||
        s.translations['zh-TW'].toLowerCase() === clean ||
        (s.aliases && s.aliases.some(a => a.toLowerCase() === clean))
    ) || null
  );
}

/**
 * Normalize subskills input into a fixed 5-slot positional array:
 * [Lv.10, Lv.25, Lv.50, Lv.70, Lv.80].
 */
export function normalizeSubskillSlots(
  input?: SubskillsInput
): Array<Subskill | null> {
  if (!input) return [null, null, null, null, null];
  if (Array.isArray(input)) {
    return [0, 1, 2, 3, 4].map(idx => resolveSubskillObject(input[idx]));
  }
  return [
    resolveSubskillObject(input.level10),
    resolveSubskillObject(input.level25),
    resolveSubskillObject(input.level50),
    resolveSubskillObject(input.level70 ?? input.level75),
    resolveSubskillObject(input.level80 ?? input.level100),
  ];
}

/**
 * Filter subskills to only those unlocked at the given level ([10, 25, 50, 70, 80]).
 */
export function getActiveSubskills(
  allSubskills: SubskillsInput = [],
  level: number
): Subskill[] {
  const slots = normalizeSubskillSlots(allSubskills);
  const active: Subskill[] = [];
  slots.forEach((subObj, idx) => {
    const unlockLevel = SUBSKILL_UNLOCK_LEVELS[idx] ?? 80;
    if (subObj && level >= unlockLevel) {
      active.push(subObj);
    }
  });
  return active;
}

/**
 * Compute main skill level bonus granted by active Skill Level Up S (+1) and M (+2).
 */
export function calculateSkillLevelUpBonus(activeSubskills: Subskill[]): number {
  let bonus = 0;
  for (const s of activeSubskills) {
    const n = s.name.toLowerCase();
    if (n === 'skill level up s') bonus += 1;
    else if (n === 'skill level up m') bonus += 2;
  }
  return bonus;
}

/**
 * Resolve ingredient combo from string (e.g. 'AAA', 'AB', 'ABC') or selection object.
 */
export function resolveIngredientsForSlots(
  mon: PokemonSpecies,
  selection?: IngredientSelection | string
): {
  slot0: { ingredient: string; amount: number };
  slot30?: { ingredient: string; amount: number };
  slot60?: { ingredient: string; amount: number };
} {
  const slot0List = mon.ingredient0 || [];
  const slot30List = mon.ingredient30 || [];
  const slot60List = mon.ingredient60 || [];

  let s0 = slot0List[0] || { ingredient: 'Apple', amount: 1 };
  let s30 = slot30List.find(i => i.ingredient !== 'Locked') || slot30List[0];
  let s60 = slot60List.find(i => i.ingredient !== 'Locked') || slot60List[0];

  if (typeof selection === 'string' && selection.length >= 1) {
    const code = selection.toUpperCase();
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
    if (selection.slot30 !== undefined) {
      if (selection.slot30 === 'Locked' || selection.slot30 === '') {
        s30 = { ingredient: 'Locked', amount: 0 };
      } else {
        const match = slot30List.find(i => i.ingredient.toLowerCase() === selection.slot30?.toLowerCase());
        if (match) s30 = match;
      }
    }
    if (selection.slot60 !== undefined) {
      if (selection.slot60 === 'Locked' || selection.slot60 === '') {
        s60 = { ingredient: 'Locked', amount: 0 };
      } else {
        const match = slot60List.find(i => i.ingredient.toLowerCase() === selection.slot60?.toLowerCase());
        if (match) s60 = match;
      }
    }
  }

  return { slot0: s0, slot30: s30, slot60: s60 };
}

/**
 * Extract distinct native ingredient species for a Pokémon (across slots 0, 30, and 60).
 * Used for skills like Ingredient Draw S that draw randomly from the species' own 3 ingredient types.
 */
export function getSpeciesNativeIngredientPool(mon: PokemonSpecies): string[] {
  const pool = new Set<string>();
  for (const item of mon.ingredient0 || []) {
    if (item.ingredient && item.ingredient !== 'Locked') pool.add(item.ingredient);
  }
  for (const item of mon.ingredient30 || []) {
    if (item.ingredient && item.ingredient !== 'Locked') pool.add(item.ingredient);
  }
  for (const item of mon.ingredient60 || []) {
    if (item.ingredient && item.ingredient !== 'Locked') pool.add(item.ingredient);
  }
  return pool.size > 0 ? Array.from(pool) : ['Apple'];
}

/**
 * Calculates concrete daily ingredient quantities acquired through main skills:
 * - Ingredient Draw S family (Sandshrew, Sandslash, Dwebble, Crustle, Hawlucha, Cutiefly, Ribombee, Mawile, Murkrow, Honchkrow):
 *   draws randomly from the species' own 3 native ingredients.
 * - Ingredient Magnet S family (Vaporeon, Eevee, Slaking, Butterfree, Blastoise, Charizard, Venusaur, Delibird, Heracross, Plusle, Toxtricity):
 *   draws randomly from all 19 unlocked ingredients in Pokémon Sleep.
 */
export function calculateSkillIngredientProduce(params: {
  mon: PokemonSpecies;
  dailySkillProcs: number;
  effectiveSkillLevel: number;
  mapBonus?: number;
  mewLearnedSkill?: string;
}): DailyIngredientProduce[] {
  const { mon, dailySkillProcs, effectiveSkillLevel, mapBonus = 0, mewLearnedSkill } = params;
  if (dailySkillProcs <= 0) return [];

  let skillName = mon.skill.name;
  let baseSkillName = mon.skill.baseSkillName || mon.skill.name;
  let activationsRaw = mon.skill.activations || {};
  let maxSkillLvl = mon.skill.maxLevel || (mon.skill.RP?.length || 6);

  // If Mew has learned Ingredient Magnet S via Eureka Seed:
  if (mon.name === 'MEW' && mewLearnedSkill?.toLowerCase().includes('ingredient magnet')) {
    const magnetMon = GAME_DATA.pokemon.find(p => p.skill.name === 'Ingredient Magnet S');
    if (magnetMon) {
      skillName = magnetMon.skill.name;
      baseSkillName = magnetMon.skill.baseSkillName || magnetMon.skill.name;
      activationsRaw = magnetMon.skill.activations || {};
      maxSkillLvl = magnetMon.skill.maxLevel || 6;
    }
  }

  const clampedLvl = Math.max(1, Math.min(effectiveSkillLevel, maxSkillLvl));
  const lvlIdx = clampedLvl - 1;
  const mapMult = 1.0 + Math.max(0, mapBonus) / 100;

  // Expected crit multiplier if skill has crit chance
  const critBoost =
    typeof mon.skill.critChance === 'number' && typeof mon.skill.critMultiplier === 'number'
      ? 1 + mon.skill.critChance * (mon.skill.critMultiplier - 1)
      : 1.0;

  // 1. Ingredient Draw S family (Sandshrew/Sandslash, Dwebble/Crustle, Hawlucha, Cutiefly/Ribombee, Mawile, Murkrow/Honchkrow)
  if (
    baseSkillName.includes('Ingredient Draw') ||
    skillName.includes('Ingredient Draw') ||
    skillName.includes('Hyper Cutter') ||
    skillName.includes('Super Luck')
  ) {
    const act = activationsRaw.ingredients;
    if (!act) return [];
    const baseAmt = act.amounts?.[lvlIdx] ?? act.amounts?.[act.amounts.length - 1] ?? 5;
    let expectedAmtPerProc = baseAmt * critBoost;
    if (act.critAmounts?.[lvlIdx] && typeof mon.skill.critChance === 'number') {
      const critVal = act.critAmounts[lvlIdx];
      const pCrit = mon.skill.critChance;
      expectedAmtPerProc = (1 - pCrit) * baseAmt + pCrit * critVal;
    }

    const poolList = getSpeciesNativeIngredientPool(mon);
    const perIngAmount = (dailySkillProcs * expectedAmtPerProc) / poolList.length;

    return poolList.map((ingName) => {
      const ingObj = GAME_DATA.ingredients.find((i) => i.name.toLowerCase() === ingName.toLowerCase());
      const ingVal = ingObj ? ingObj.value : 100;
      const longName = ingObj ? ingObj.longName : ingName;
      return {
        ingredient: ingName,
        longName,
        amount: perIngAmount,
        energy: perIngAmount * ingVal * mapMult,
      };
    });
  }

  // 2. Ingredient Magnet S family (Vaporeon, Eevee, Slaking, Butterfree, Blastoise, Charizard, Venusaur, Delibird, Heracross, Plusle, etc.)
  const ingAct = activationsRaw.ingredients || activationsRaw.solo;
  if (
    ingAct &&
    (baseSkillName.includes('Ingredient Magnet') ||
      skillName.includes('Ingredient Magnet') ||
      skillName.includes('Present') ||
      skillName.includes('Bulk Up') ||
      skillName.includes('Plus'))
  ) {
    const baseAmt = ingAct.amounts?.[lvlIdx] ?? ingAct.amounts?.[ingAct.amounts.length - 1] ?? 6;
    const expectedAmtPerProc = baseAmt * critBoost;
    const totalDailySkillIngs = dailySkillProcs * expectedAmtPerProc;
    const allIngredients = GAME_DATA.ingredients;
    const perIngAmount = totalDailySkillIngs / allIngredients.length;

    const list: DailyIngredientProduce[] = allIngredients.map((ing) => ({
      ingredient: ing.name,
      longName: ing.longName,
      amount: perIngAmount,
      energy: perIngAmount * ing.value * mapMult,
    }));

    // If Plus skill has paired bonus Coffee:
    if (skillName.includes('Plus') && activationsRaw.paired?.amounts?.[lvlIdx]) {
      const pairedAmt = activationsRaw.paired.amounts[lvlIdx];
      const coffeeItem = list.find((i) => i.ingredient.toLowerCase() === 'coffee');
      if (coffeeItem) {
        const extraCoffee = dailySkillProcs * pairedAmt;
        coffeeItem.amount += extraCoffee;
        const coffeeObj = GAME_DATA.ingredients.find((i) => i.name.toLowerCase() === 'coffee');
        coffeeItem.energy += extraCoffee * (coffeeObj ? coffeeObj.value : 120) * mapMult;
      }
    }

    return list;
  }

  // 3. Fallback for any other skill activation specifying unit === 'ingredients'
  for (const act of Object.values(activationsRaw)) {
    if (act.unit === 'ingredients') {
      const baseAmt = act.amounts?.[lvlIdx] ?? act.amounts?.[act.amounts.length - 1] ?? 5;
      const totalDailySkillIngs = dailySkillProcs * baseAmt * critBoost;
      const allIngredients = GAME_DATA.ingredients;
      const perIngAmount = totalDailySkillIngs / allIngredients.length;
      return allIngredients.map((ing) => ({
        ingredient: ing.name,
        longName: ing.longName,
        amount: perIngAmount,
        energy: perIngAmount * ing.value * mapMult,
      }));
    }
  }

  return [];
}

/**
 * Evaluate quantized skill outputs & estimated Snorlax strength equivalent.
 */
export function evaluateSkillActivations(params: {
  mon: PokemonSpecies;
  level: number;
  baseSkillLevel: number;
  skillLevelUpBonus: number;
  effectiveSkillLevel: number;
  baseTriggerRate: number;
  modifiedTriggerRate: number;
  effectiveTriggerRate: number;
  dailySkillProcs: number;
  selfBerryFinalStrength: number;
  selfBerryBaseStrengthAtLevel: number;
  mapBonus: number;
  cookingContext?: CookingScenarioContext;
  mewLearnedSkill?: string;
}): { dailySkillEnergy: number; summary: SkillActivationSummary } {
  const {
    mon,
    baseSkillLevel,
    skillLevelUpBonus,
    effectiveSkillLevel,
    baseTriggerRate,
    modifiedTriggerRate,
    effectiveTriggerRate,
    dailySkillProcs,
    selfBerryFinalStrength,
    selfBerryBaseStrengthAtLevel,
    mapBonus,
    cookingContext,
    mewLearnedSkill,
  } = params;

  const maxSkillLevel = mon.skill.maxLevel || (mon.skill.RP?.length || 6);
  const clampedLvl = Math.max(1, Math.min(effectiveSkillLevel, maxSkillLevel));
  const lvlIdx = clampedLvl - 1;
  const fieldMult = 1.0 + Math.max(0, mapBonus) / 100;
  const skillName = mon.skill.name;
  const baseSkillName = mon.skill.baseSkillName || mon.skill.name;
  const description = mon.skill.descriptions?.[lvlIdx] || '';

  const activationsRaw = mon.skill.activations || {};
  const breakdown: SkillActivationBreakdownItem[] = [];
  let totalEstimatedEnergy = 0;

  // Expected crit multiplier for skills like Disguise (Berry Burst)
  const critBoost =
    typeof mon.skill.critChance === 'number' && typeof mon.skill.critMultiplier === 'number'
      ? 1 + mon.skill.critChance * (mon.skill.critMultiplier - 1)
      : 1.0;

  // Specialized Handling for Mew's "十项全能" (Versatile):
  // Inherently yields candy + executes the learned main skill from Eureka Seed!
  if (mon.name === 'MEW' || mon.skill.name === 'Versatile') {
    const effectiveLearned = mewLearnedSkill || 'Metronome';
    // 1. Inherent Versatile Candy Reward
    const candyAct = activationsRaw.candy;
    const baseCandyAmt = candyAct?.amounts?.[lvlIdx] ?? 1;
    const critCandyAmt = candyAct?.critAmounts?.[lvlIdx] ?? 0;
    const expectedCandy = baseCandyAmt + critCandyAmt * 0.25;
    const dailyCandies = dailySkillProcs * expectedCandy;
    const candyEnergy = dailyCandies * 400 * fieldMult;

    breakdown.push({
      key: 'candy',
      unit: 'candy' as MainskillUnit,
      perProcSelf: baseCandyAmt,
      perProcTeamEach: 0,
      dailySelf: dailyCandies,
      dailyTeamTotal: 0,
      estimatedDailyEnergy: candyEnergy,
    });
    totalEstimatedEnergy += candyEnergy;

    // 2. Learned Skill Execution
    if (effectiveLearned === 'Metronome') {
      const metronomeEst = dailySkillProcs * 1350 * fieldMult;
      breakdown.push({
        key: 'metronome',
        unit: 'strength' as MainskillUnit,
        perProcSelf: 1350,
        perProcTeamEach: 0,
        dailySelf: metronomeEst,
        dailyTeamTotal: 0,
        estimatedDailyEnergy: metronomeEst,
      });
      totalEstimatedEnergy += metronomeEst;
    } else {
      const learnedMon = GAME_DATA.pokemon.find(
        (p) =>
          p.skill.name.toLowerCase() === effectiveLearned.toLowerCase() ||
          p.skill.baseSkillName?.toLowerCase() === effectiveLearned.toLowerCase()
      );
      if (learnedMon && learnedMon.skill.activations) {
        const learnedActs = learnedMon.skill.activations;
        const learnedBase = learnedMon.skill.baseSkillName || learnedMon.skill.name;
        const learnedMax = learnedMon.skill.maxLevel || 6;
        const learnedLvlIdx = Math.max(0, Math.min(effectiveSkillLevel, learnedMax) - 1);

        for (const [actKey, actDef] of Object.entries(learnedActs)) {
          if ((actKey === 'low' || actKey === 'high') && learnedActs.mean) continue;
          if (actKey === 'paired' && learnedActs.solo) continue;
          if (actKey === 'pairedHelps' && learnedActs.soloHelps) continue;

          const rawAmt = actDef.amounts?.[learnedLvlIdx] ?? actDef.amounts?.[actDef.amounts.length - 1] ?? 0;
          const isTeamOnlyBerries = actKey === 'teamBerries';
          const selfAmt = isTeamOnlyBerries ? 0 : rawAmt;
          const teamEach = isTeamOnlyBerries ? rawAmt : (actDef.teamAmounts?.[learnedLvlIdx] ?? 0);
          const isTeamWideAll5 =
            (actDef.unit === 'energy' && learnedBase.includes('Energy For Everyone')) ||
            (actDef.unit === 'helps' && learnedBase.includes('Helper Boost'));
          const teamTotalPerProc = isTeamWideAll5 ? selfAmt * 5 : teamEach > 0 ? teamEach * 4 : 0;

          const dailySelf = dailySkillProcs * selfAmt * critBoost;
          const dailyTeamTotal = dailySkillProcs * teamTotalPerProc * critBoost;

          let estEnergy = 0;
          switch (actDef.unit) {
            case 'berries': {
              const selfEnergyPerProc = selfAmt * selfBerryFinalStrength * critBoost;
              const teamEnergyPerProc = 4 * teamEach * selfBerryBaseStrengthAtLevel * fieldMult * critBoost;
              estEnergy = dailySkillProcs * (selfEnergyPerProc + teamEnergyPerProc);
              break;
            }
            case 'strength': {
              estEnergy = dailySkillProcs * selfAmt * fieldMult;
              break;
            }
            case 'ingredients': {
              const avgIngEnergy = 125 * fieldMult;
              estEnergy = (dailySelf + dailyTeamTotal) * avgIngEnergy;
              break;
            }
            case 'pot size': {
              const fillerBase = cookingContext?.fillerEnergyPerSlot ?? 135;
              const recipeMult = cookingContext?.recipeMultiplier ?? 1.0;
              const avgPotSlotBonusEnergy = fillerBase * recipeMult * fieldMult;
              estEnergy = dailySelf * avgPotSlotBonusEnergy;
              break;
            }
            case 'energy': {
              if (learnedBase.includes('Energy For Everyone')) {
                estEnergy = dailySkillProcs * selfAmt * 160 * fieldMult;
              } else if (learnedBase.includes('Energizing Cheer')) {
                estEnergy = dailySkillProcs * selfAmt * 55 * fieldMult;
              } else {
                estEnergy = dailySkillProcs * selfAmt * 20 * fieldMult;
              }
              break;
            }
            case 'helps': {
              estEnergy = dailySkillProcs * selfAmt * 185 * fieldMult;
              break;
            }
            case 'crit chance': {
              const mealEnergy = cookingContext?.dishEnergyBaseline ?? 35000;
              const scale = mealEnergy / 35000;
              estEnergy = dailySkillProcs * selfAmt * 420 * scale * fieldMult;
              break;
            }
            case 'dream shards': {
              estEnergy = dailySkillProcs * (learnedMon.skill.RP?.[learnedLvlIdx] ?? 400) * 0.65 * fieldMult;
              break;
            }
            default: {
              estEnergy = dailySkillProcs * (learnedMon.skill.RP?.[learnedLvlIdx] ?? 400) * fieldMult;
              break;
            }
          }

          totalEstimatedEnergy += estEnergy;
          breakdown.push({
            key: `learned_${actKey}`,
            unit: actDef.unit,
            perProcSelf: selfAmt,
            perProcTeamEach: teamEach,
            dailySelf,
            dailyTeamTotal,
            estimatedDailyEnergy: estEnergy,
          });
        }
      }
    }

    const primary = breakdown.find((b) => b.key !== 'candy') || breakdown[0];
    const perProcTotalPrimary =
      primary.unit === 'berries' && primary.perProcTeamEach > 0
        ? primary.perProcSelf + 4 * primary.perProcTeamEach
        : primary.perProcSelf;
    const dailyTotalPrimary =
      primary.unit === 'berries' && primary.perProcTeamEach > 0
        ? primary.dailySelf + primary.dailyTeamTotal
        : primary.dailySelf;

    return {
      dailySkillEnergy: totalEstimatedEnergy,
      summary: {
        skillName: `Versatile (${effectiveLearned})`,
        baseSkillName: `Versatile (${effectiveLearned})`,
        baseSkillLevel,
        skillLevelUpBonus,
        effectiveSkillLevel: clampedLvl,
        maxSkillLevel,
        baseTriggerRate,
        modifiedTriggerRate,
        effectiveTriggerRate,
        pityProcThreshold: mon.pityProcThreshold,
        dailySkillProcs,
        primaryUnit: primary.unit,
        perProcOutput: perProcTotalPrimary,
        dailyOutput: dailyTotalPrimary,
        perProcTeamTotalOutput: primary.perProcTeamEach > 0 ? 4 * primary.perProcTeamEach : 0,
        dailyTeamTotalOutput: primary.dailyTeamTotal,
        description: `十项全能（已习得「${effectiveLearned}」+ 附赠队伍糖果）`,
        activations: breakdown,
      },
    };
  }

  const actEntries = Object.entries(activationsRaw);

  for (const [actKey, actDef] of actEntries) {
    // Skip mutually-exclusive range bounds or paired-only variants in L1 solo evaluation:
    // - ChargeStrengthSRange defines { mean, low, high }: only evaluate `mean`
    // - Draco Meteor / Plus / Minus define { solo, paired }: only evaluate `solo`
    // - Heal Pulse defines { soloHelps, pairedHelps }: only evaluate `soloHelps`
    if ((actKey === 'low' || actKey === 'high') && activationsRaw.mean) continue;
    if (actKey === 'paired' && activationsRaw.solo) continue;
    if (actKey === 'pairedHelps' && activationsRaw.soloHelps) continue;

    const rawAmt = actDef.amounts?.[lvlIdx] ?? actDef.amounts?.[actDef.amounts.length - 1] ?? 0;
    const isTeamOnlyBerries = actKey === 'teamBerries';
    const selfAmt = isTeamOnlyBerries ? 0 : rawAmt;
    const teamEach = isTeamOnlyBerries ? rawAmt : (actDef.teamAmounts?.[lvlIdx] ?? 0);
    const isTeamWideAll5 =
      actDef.unit === 'energy' &&
      (baseSkillName.includes('Energy For Everyone') || skillName.includes('Energy For Everyone')) ||
      (actDef.unit === 'helps' && baseSkillName.includes('Helper Boost'));
    const teamTotalPerProc = isTeamWideAll5
      ? selfAmt * 5
      : teamEach > 0
        ? teamEach * 4
        : 0;

    const dailySelf = dailySkillProcs * selfAmt * critBoost;
    const dailyTeamTotal = dailySkillProcs * teamTotalPerProc * critBoost;

    let estEnergy = 0;
    switch (actDef.unit) {
      case 'berries': {
        // Self berries use Pokémon's actual berry strength (including favored 2x & map bonus)
        // Team berries (4 teammates) use level-scaled berry strength * mapBonus
        const selfEnergyPerProc = selfAmt * selfBerryFinalStrength * critBoost;
        const teamEnergyPerProc = 4 * teamEach * selfBerryBaseStrengthAtLevel * fieldMult * critBoost;
        estEnergy = dailySkillProcs * (selfEnergyPerProc + teamEnergyPerProc);
        break;
      }
      case 'strength': {
        estEnergy = dailySkillProcs * selfAmt * fieldMult;
        break;
      }
      case 'ingredients': {
        const avgIngEnergy = 125 * fieldMult;
        estEnergy = (dailySelf + dailyTeamTotal) * avgIngEnergy;
        break;
      }
      case 'pot size': {
        const fillerBase = cookingContext?.fillerEnergyPerSlot ?? 135;
        const recipeMult = cookingContext?.recipeMultiplier ?? 1.0;
        const avgPotSlotBonusEnergy = fillerBase * recipeMult * fieldMult;
        estEnergy = dailySelf * avgPotSlotBonusEnergy;
        break;
      }
      case 'energy': {
        // Energy recovery maintains 2.22x speed multiplier across team vs self
        if (baseSkillName.includes('Energy For Everyone')) {
          estEnergy = dailySkillProcs * selfAmt * 160 * fieldMult;
        } else if (baseSkillName.includes('Energizing Cheer')) {
          estEnergy = dailySkillProcs * selfAmt * 55 * fieldMult;
        } else {
          // Self Charge Energy S: keeps self near 100% energy, modest direct equivalent
          estEnergy = dailySkillProcs * selfAmt * 20 * fieldMult;
        }
        break;
      }
      case 'helps': {
        const teamMult = baseSkillName.includes('Helper Boost') ? 5 : 1;
        estEnergy = dailySkillProcs * selfAmt * teamMult * 185 * fieldMult;
        break;
      }
      case 'crit chance': {
        // Tasty Chance S (+% meal crit chance)
        // Baseline 35,000 meal energy produces ~420 base value per % of daily crit boost with Markov reset.
        const mealEnergy = cookingContext?.dishEnergyBaseline ?? 35000;
        const scale = mealEnergy / 35000;
        estEnergy = dailySkillProcs * selfAmt * 420 * scale * fieldMult;
        break;
      }
      case 'dream shards': {
        // Dream Shard Magnet S — utility skill, use RP-aligned valuation
        estEnergy = dailySkillProcs * (mon.skill.RP?.[lvlIdx] ?? 400) * 0.65 * fieldMult;
        break;
      }
      default: {
        estEnergy = dailySkillProcs * (mon.skill.RP?.[lvlIdx] ?? 400) * fieldMult;
        break;
      }
    }

    totalEstimatedEnergy += estEnergy;
    breakdown.push({
      key: actKey,
      unit: actDef.unit,
      perProcSelf: selfAmt,
      perProcTeamEach: teamEach,
      dailySelf,
      dailyTeamTotal,
      estimatedDailyEnergy: estEnergy,
    });
  }

  // Fallback if activations map is empty (e.g. Metronome, Skill Copy, Versatile)
  if (breakdown.length === 0) {
    const fallbackRp = mon.skill.RP?.[lvlIdx] ?? 400;
    const estEnergy = dailySkillProcs * fallbackRp * fieldMult;
    totalEstimatedEnergy = estEnergy;
    breakdown.push({
      key: 'default',
      unit: 'strength',
      perProcSelf: Math.round(fallbackRp * fieldMult),
      perProcTeamEach: 0,
      dailySelf: estEnergy,
      dailyTeamTotal: 0,
      estimatedDailyEnergy: estEnergy,
    });
  }

  const primary = breakdown[0];
  const perProcTotalPrimary =
    primary.unit === 'berries' && primary.perProcTeamEach > 0
      ? primary.perProcSelf + 4 * primary.perProcTeamEach
      : primary.perProcSelf;
  const dailyTotalPrimary =
    primary.unit === 'berries' && primary.perProcTeamEach > 0
      ? primary.dailySelf + primary.dailyTeamTotal
      : primary.dailySelf;

  return {
    dailySkillEnergy: totalEstimatedEnergy,
    summary: {
      skillName,
      baseSkillName,
      baseSkillLevel,
      skillLevelUpBonus,
      effectiveSkillLevel: clampedLvl,
      maxSkillLevel,
      baseTriggerRate,
      modifiedTriggerRate,
      effectiveTriggerRate,
      pityProcThreshold: mon.pityProcThreshold,
      dailySkillProcs,
      primaryUnit: primary.unit,
      perProcOutput: perProcTotalPrimary,
      dailyOutput: dailyTotalPrimary,
      perProcTeamTotalOutput: primary.perProcTeamEach > 0 ? 4 * primary.perProcTeamEach : 0,
      dailyTeamTotalOutput: primary.dailyTeamTotal,
      description,
      activations: breakdown,
    },
  };
}

/**
 * Backwards-compatible helper for L1 skill energy estimation.
 */
export function estimateSkillEnergy(
  mon: PokemonSpecies,
  dailySkillProcs: number,
  mainSkillLevel: number = 1,
  mapBonus: number = 0,
  level: number = 30,
  isFavoredBerry: boolean = false
): number {
  if (dailySkillProcs <= 0) return 0;
  const berryObj = GAME_DATA.berries.find(b => b.name.toUpperCase() === mon.berry.toUpperCase());
  const berryStr = calculateBerryStrength({
    baseValue: berryObj ? berryObj.value : 25,
    level,
    isFavored: isFavoredBerry,
    mapBonus,
  });
  return evaluateSkillActivations({
    mon,
    level,
    baseSkillLevel: mainSkillLevel,
    skillLevelUpBonus: 0,
    effectiveSkillLevel: mainSkillLevel,
    baseTriggerRate: mon.skillPercentage / 100,
    modifiedTriggerRate: mon.skillPercentage / 100,
    effectiveTriggerRate: mon.skillPercentage / 100,
    dailySkillProcs,
    selfBerryFinalStrength: berryStr.finalStrength,
    selfBerryBaseStrengthAtLevel: berryStr.baseStrengthAtLevel,
    mapBonus,
  }).dailySkillEnergy;
}

/**
 * Calculates overnight production and full inventory dynamics for a sleep session (default 8.5h).
 */
export function calculateOvernightProduction(params: {
  carryLimit: number;
  helpingFrequency: number;
  dailyHelps: number;
  berriesPerDrop: number;
  berryRate: number;
  ingredientRate: number;
  dailyBerryCount: number;
  dailyIngredientCount: number;
  dailyIngredientEnergy: number;
  berryStrength: number;
  skillRate: number;
  dailySkillProcs: number;
  dailySkillEnergy: number;
  totalDailyEnergy: number;
  sleepHours?: number;
}): OvernightAnalysisResult {
  const sleepHours = params.sleepHours ?? 8.5;
  const carryLimit = params.carryLimit;
  const helpsPerHour = 3600 / Math.max(1, params.helpingFrequency);

  // Total daily items produced under regular conditions
  const totalDailyItems = params.dailyBerryCount + params.dailyIngredientCount;
  const itemsPerHour = totalDailyItems / 24;
  const timeToFullHours = itemsPerHour > 0 ? carryLimit / itemsPerHour : 24;
  const isFullDuringSleep = timeToFullHours < sleepHours;

  const normalHours = Math.min(sleepHours, timeToFullHours);
  const sneakySnackHours = Math.max(0, sleepHours - timeToFullHours);

  const normalHelps = normalHours * helpsPerHour;
  const sneakySnackHelps = sneakySnackHours * helpsPerHour;

  // Normal Phase Output (both berries and ingredients accumulate in bag, skills can trigger)
  const normalBerries = normalHelps * params.berryRate * params.berriesPerDrop;
  const normalIngredients = (normalHours / 24) * params.dailyIngredientCount;
  const normalSkillProcs = normalHelps * params.skillRate;

  const normalBerryEnergy = normalBerries * params.berryStrength;
  const normalIngredientEnergy = (normalHours / 24) * params.dailyIngredientEnergy;
  const avgEnergyPerSkillProc =
    params.dailySkillProcs > 0 ? params.dailySkillEnergy / params.dailySkillProcs : 0;
  const normalSkillEnergy = normalSkillProcs * avgEnergyPerSkillProc;
  const normalEnergy = normalBerryEnergy + normalIngredientEnergy + normalSkillEnergy;

  // Sneaky Snacking Phase Output (100% of helps drop berries directly into Snorlax)
  const sneakySnackBerries = sneakySnackHelps * params.berriesPerDrop;
  const sneakySnackEnergy = sneakySnackBerries * params.berryStrength;

  // Losses during Sneaky Snacking: ingredients and skills are halted
  const lostIngredients = (sneakySnackHours / 24) * params.dailyIngredientCount;
  const lostSkillProcs = sneakySnackHelps * params.skillRate;

  const totalOvernightBerries = normalBerries + sneakySnackBerries;
  const totalOvernightEnergy = normalEnergy + sneakySnackEnergy;
  const idealOvernightEnergy = (sleepHours / 24) * params.totalDailyEnergy;
  const efficiencyRatio =
    idealOvernightEnergy > 0 ? totalOvernightEnergy / idealOvernightEnergy : 1.0;

  let daytimeCollectionRecommendation = '';
  if (timeToFullHours < 3.0) {
    daytimeCollectionRecommendation = `极速满包型：日间建议每 ${timeToFullHours.toFixed(1)} 小时收取一次，避免食材与技能损失`;
  } else if (timeToFullHours < 5.0) {
    daytimeCollectionRecommendation = `中速满包型：日间建议每 ${timeToFullHours.toFixed(1)} 小时收取一次`;
  } else {
    daytimeCollectionRecommendation = `高背包冗余型：日间可每 ${timeToFullHours.toFixed(1)} 小时或更久收取一次`;
  }

  return {
    sleepHours,
    carryLimit,
    timeToFullHours,
    isFullDuringSleep,
    timeInSneakySnackHours: sneakySnackHours,
    normalHelps,
    sneakySnackHelps,
    normalBerries,
    sneakySnackBerries,
    totalOvernightBerries,
    overnightIngredients: normalIngredients,
    overnightSkillProcs: normalSkillProcs,
    normalEnergy,
    sneakySnackEnergy,
    totalOvernightEnergy,
    idealOvernightEnergy,
    efficiencyRatio,
    lostIngredients,
    lostSkillProcs,
    daytimeCollectionRecommendation,
  };
}

/**
 * Calculates complete L1 single-Pokémon daily expected production.
 */
export function calculateDailyProduction(params: ProductionParams): ProductionResult {
  const {
    pokemon: rawPokemon,
    level: rawLevel,
    nature: rawNature,
    subskills: rawSubskills = [],
    ingredientSelection,
    mainSkillLevel = 1,
    applySkillLevelUpSubskills = true,
    ribbonLevel = 0,
    goodCampTicket = false,
    nrOfTeamHelpingBonus = 0,
    energyMultiplier = 0.45,
    isFavoredBerry = false,
    mapBonus = 0,
    withPity = true,
    cookingContext,
    sleepHours = 8.5,
    allowPreviewLv80 = false,
    mewLearnedSkill,
  } = params;

  const maxAllowedLevel = allowPreviewLv80 ? MAX_PREVIEW_POKEMON_LEVEL : MAX_POKEMON_LEVEL;
  const level = Math.max(1, Math.min(maxAllowedLevel, rawLevel));

  // Resolve Pokémon species
  const mon: PokemonSpecies | undefined =
    typeof rawPokemon === 'string'
      ? GAME_DATA.pokemon.find(
          p =>
            p.name.toUpperCase() === rawPokemon.toUpperCase() ||
            p.displayName.toLowerCase() === rawPokemon.toLowerCase() ||
            p.translations['zh-CN'] === rawPokemon ||
            p.translations['zh-TW'] === rawPokemon
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
              n.translations['zh-CN'] === rawNature ||
              n.translations['zh-TW'] === rawNature
          ) || null
        : rawNature;
  }

  // 1. Filter active subskills for current level ([10, 25, 50, 70, 80])
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

  // 5. Berries Production & Sneaky Snacking
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
  const sneakySnackingDailyEnergy = dailyHelps * berriesPerDrop * berryStrengthResult.finalStrength;

  // 6. Ingredients Production
  const resolvedSlots = resolveIngredientsForSlots(mon, ingredientSelection);
  const unlockedSlots: Array<{ ingredient: string; amount: number }> = [resolvedSlots.slot0];
  if (
    level >= 30 &&
    resolvedSlots.slot30 &&
    resolvedSlots.slot30.ingredient !== 'Locked' &&
    resolvedSlots.slot30.amount > 0
  ) {
    unlockedSlots.push(resolvedSlots.slot30);
  }
  if (
    level >= 60 &&
    resolvedSlots.slot60 &&
    resolvedSlots.slot60.ingredient !== 'Locked' &&
    resolvedSlots.slot60.amount > 0
  ) {
    unlockedSlots.push(resolvedSlots.slot60);
  }

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

  // Average items per help -> hours to fill carry limit
  const totalDailyItems = dailyBerryCount + dailyIngredientCount;
  const itemsPerHour = totalDailyItems / 24;
  const hoursToFullCarry = itemsPerHour > 0 ? carryResult.totalCarryLimit / itemsPerHour : 24;

  // 7. Skill Procs, Skill Level Up S/M & Quantized Skill Activations
  const skillLevelUpBonus = calculateSkillLevelUpBonus(activeSubskills);
  const maxSkillLvl = mon.skill.maxLevel || (mon.skill.RP?.length || 6);
  const effectiveMainSkillLevel = Math.max(
    1,
    Math.min(maxSkillLvl, mainSkillLevel + (applySkillLevelUpSubskills ? skillLevelUpBonus : 0))
  );

  const skillProcResult = calculateSkillRate({
    baseSkillPercentage: mon.skillPercentage,
    pityProcThreshold: mon.pityProcThreshold,
    nature,
    subskills: activeSubskills,
    withPity,
  });

  const dailySkillProcs = dailyHelps * skillProcResult.effectiveRate;
  const skillEval = evaluateSkillActivations({
    mon,
    level,
    baseSkillLevel: mainSkillLevel,
    skillLevelUpBonus,
    effectiveSkillLevel: effectiveMainSkillLevel,
    baseTriggerRate: skillProcResult.baseRate,
    modifiedTriggerRate: skillProcResult.rateWithoutPity,
    effectiveTriggerRate: skillProcResult.effectiveRate,
    dailySkillProcs,
    selfBerryFinalStrength: berryStrengthResult.finalStrength,
    selfBerryBaseStrengthAtLevel: berryStrengthResult.baseStrengthAtLevel,
    mapBonus,
    cookingContext,
    mewLearnedSkill,
  });
  const dailySkillEnergy = skillEval.dailySkillEnergy;

  // Concrete ingredients acquired from main skill (Ingredient Magnet S, Ingredient Draw S, etc.)
  const skillDailyIngredients = calculateSkillIngredientProduce({
    mon,
    dailySkillProcs,
    effectiveSkillLevel: effectiveMainSkillLevel,
    mapBonus,
    mewLearnedSkill,
  });

  let skillDailyIngredientCount = 0;
  let skillDailyIngredientEnergy = 0;
  for (const s of skillDailyIngredients) {
    skillDailyIngredientCount += s.amount;
    skillDailyIngredientEnergy += s.energy;
  }

  // Merged direct + skill ingredients map
  const combinedMap = new Map<string, DailyIngredientProduce>();
  for (const d of dailyIngredients) {
    combinedMap.set(d.ingredient.toLowerCase(), { ...d });
  }
  for (const s of skillDailyIngredients) {
    const key = s.ingredient.toLowerCase();
    const existing = combinedMap.get(key);
    if (existing) {
      existing.amount += s.amount;
      existing.energy += s.energy;
    } else {
      combinedMap.set(key, { ...s });
    }
  }
  const combinedDailyIngredients = Array.from(combinedMap.values());
  const combinedDailyIngredientCount = dailyIngredientCount + skillDailyIngredientCount;

  // 8. Total Daily Energy & RP
  const totalDailyEnergy = dailyBerryEnergy + dailyIngredientEnergy + dailySkillEnergy;
  const rpResult = calculateRP({
    pokemon: mon,
    level,
    skillLevel: effectiveMainSkillLevel,
    nature,
    activeSubskills,
    unlockedIngredients: unlockedSlots,
    ribbonLevel,
  });

  // 9. Overnight Sleep & Carry Dynamics Simulation
  const overnightAnalysis = calculateOvernightProduction({
    carryLimit: carryResult.totalCarryLimit,
    helpingFrequency: freqResult.frequency,
    dailyHelps,
    berriesPerDrop,
    berryRate,
    ingredientRate,
    dailyBerryCount,
    dailyIngredientCount,
    dailyIngredientEnergy,
    berryStrength: berryStrengthResult.finalStrength,
    skillRate: skillProcResult.effectiveRate,
    dailySkillProcs,
    dailySkillEnergy,
    totalDailyEnergy,
    sleepHours,
  });

  return {
    pokemon: mon,
    level,
    nature,
    activeSubskills,
    unlockedIngredientSlots: unlockedSlots.length,
    helpingFrequency: freqResult.frequency,
    dailyHelps,
    carryLimit: carryResult.totalCarryLimit,
    hoursToFullCarry,
    ingredientRate,
    berryRate,
    berriesPerDrop,
    berryStrength: berryStrengthResult.finalStrength,
    dailyBerryCount,
    dailyBerryEnergy,
    sneakySnackingDailyEnergy,
    dailyIngredients,
    dailyIngredientCount,
    dailyIngredientEnergy,
    skillDailyIngredients,
    skillDailyIngredientCount,
    skillDailyIngredientEnergy,
    combinedDailyIngredients,
    combinedDailyIngredientCount,
    skillRate: skillProcResult.effectiveRate,
    baseSkillRate: skillProcResult.baseRate,
    skillRateWithoutPity: skillProcResult.rateWithoutPity,
    effectiveMainSkillLevel,
    skillLevelUpBonus,
    dailySkillProcs,
    dailySkillEnergy,
    skillActivationDetails: skillEval.summary,
    totalDailyEnergy,
    rp: rpResult.rp,
    overnightAnalysis,
  };
}
