import {
  GAME_DATA,
  PokemonSpecies,
  Nature,
  Subskill,
  Berry,
  Island,
} from '@pokesleep/data';
import { calculateDailyProduction } from '../production';

export type EnergyRankingScope =
  | 'same_berry' // 同树果/同属性竞争 (如 芒念果 DURIN / 草属性)
  | 'same_island' // 同岛屿喜好树果全员大乱斗 (如 拉碧斯拉丝湖畔 Lapis Lakeside)
  | 'all_berry_mon'; // 全游树果专长霸主榜

export type EnergyRankingSpecialtyFilter =
  | 'all' // 全部专长 (跨界PK: 大竺葵 树果型 vs 蜥蜴王 技能型 vs 妙蛙花 食材型 同台竞争!)
  | 'berry' // 仅树果型
  | 'skill' // 仅技能型
  | 'ingredient'; // 仅食材型

export type EnergyRankingMetric =
  | 'berry_energy' // 纯树果日均能量
  | 'total_energy'; // 全天总能量贡献 (树果 + 食材 + 主技能)

export interface EnergyRankingFilters {
  scope?: EnergyRankingScope; // default 'same_berry'
  targetBerry?: string; // e.g. 'DURIN', 'GREPA', 'LEPPA'
  targetIslandName?: string; // e.g. 'Lapis Lakeside', 'Cyan Beach'
  specialtyFilter?: EnergyRankingSpecialtyFilter; // default 'all'
  metric?: EnergyRankingMetric; // default 'berry_energy'
  level?: number; // default 50
  onlyFinalEvolution?: boolean; // default true
  preset?: 'optimal' | 'neutral'; // default 'optimal'
  isFavoredBerry?: boolean; // default true
  currentPokemon?: {
    pokemonName: string;
    level: number;
    nature?: Nature | string | null;
    subskills?: Array<Subskill | string>;
    ingredientSelection?: string;
    ribbonLevel?: number;
    mainSkillLevel?: number;
    mewLearnedSkill?: string;
  };
}

export interface EnergyRankingEntry {
  pokemon: PokemonSpecies;
  level: number;
  specialty: string;
  berry: string;
  dailyBerryEnergy: number;
  dailyTotalEnergy: number;
  dailyHelps: number;
  metricScore: number;
  isFinalEvolution: boolean;
  isCurrentPokemon: boolean;
  subskillSummary: string;
  relativePercentage: number; // 0 to 100 relative to top rank
}

export interface EnergyRankingResult {
  scope: EnergyRankingScope;
  scopeDisplayName: string;
  targetBerry?: string;
  targetBerryObj?: Berry;
  targetIsland?: Island;
  specialtyFilter: EnergyRankingSpecialtyFilter;
  metric: EnergyRankingMetric;
  level: number;
  maxScore: number;
  entries: EnergyRankingEntry[];
}

const OPTIMAL_BERRY_SUBSKILLS: string[] = [
  'Berry Finding S',
  'Helping Bonus',
  'Helping Speed M',
  'Helping Speed S',
  'Inventory Up L',
];

const OPTIMAL_SKILL_ENERGY_SUBSKILLS: string[] = [
  'Berry Finding S',
  'Helping Bonus',
  'Helping Speed M',
  'Skill Trigger M',
  'Helping Speed S',
];

const OPTIMAL_ING_ENERGY_SUBSKILLS: string[] = [
  'Berry Finding S',
  'Helping Bonus',
  'Helping Speed M',
  'Ingredient Finder M',
  'Helping Speed S',
];

function round(n: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

/**
 * Finds the native island where a specific berry is favored.
 */
export function findIslandForBerry(berryName: string): Island | undefined {
  const bUpper = berryName.toUpperCase();
  return GAME_DATA.islands.find((isl) =>
    isl.berries.some((b) => b.toUpperCase() === bUpper)
  );
}

/**
 * Cross-species berry and island energy benchmarking ladder.
 * Allows Meganium (berry specialist) and Sceptile (skill specialist) to flexibly
 * compete on Durin Berry / Lapis Lakeside under customizable specialty filters.
 */
export function rankEnergyProducers(filters: EnergyRankingFilters): EnergyRankingResult {
  const {
    scope = 'same_berry',
    targetBerry: rawTargetBerry,
    targetIslandName,
    specialtyFilter = 'all',
    metric = 'berry_energy',
    level = 50,
    onlyFinalEvolution = true,
    preset = 'optimal',
    isFavoredBerry = true,
    currentPokemon,
  } = filters;

  // Determine current mon species if passed
  const currMon = currentPokemon
    ? GAME_DATA.pokemon.find(
        (p) =>
          p.name.toUpperCase() === currentPokemon.pokemonName.toUpperCase() ||
          p.displayName.toLowerCase() === currentPokemon.pokemonName.toLowerCase() ||
          p.translations['zh-CN'] === currentPokemon.pokemonName ||
          p.translations['zh-TW'] === currentPokemon.pokemonName
      )
    : undefined;

  // Resolve target berry and target island
  let targetBerry = rawTargetBerry || currMon?.berry || 'DURIN';
  targetBerry = targetBerry.toUpperCase();
  const targetBerryObj = GAME_DATA.berries.find((b) => b.name.toUpperCase() === targetBerry);

  let targetIsland: Island | undefined;
  if (targetIslandName) {
    targetIsland = GAME_DATA.islands.find(
      (isl) =>
        isl.name.toLowerCase() === targetIslandName.toLowerCase() ||
        isl.translations['zh-CN'] === targetIslandName ||
        isl.translations['zh-TW'] === targetIslandName
    );
  } else {
    targetIsland = findIslandForBerry(targetBerry);
  }

  // Gather candidate species based on scope
  let candidateSpecies: PokemonSpecies[] = [];
  if (scope === 'same_berry') {
    candidateSpecies = GAME_DATA.pokemon.filter(
      (p) => p.berry && p.berry.toUpperCase() === targetBerry
    );
  } else if (scope === 'same_island' && targetIsland) {
    const islandBerries = new Set(targetIsland.berries.map((b) => b.toUpperCase()));
    candidateSpecies = GAME_DATA.pokemon.filter(
      (p) => p.berry && islandBerries.has(p.berry.toUpperCase())
    );
  } else {
    // all_berry_mon / global energy ladder:
    // If specialtyFilter is 'all', allow all Pokemon across specialties to compete!
    candidateSpecies = [...GAME_DATA.pokemon];
  }

  // Filter by specialty if requested
  if (specialtyFilter !== 'all') {
    candidateSpecies = candidateSpecies.filter((p) => p.specialty === specialtyFilter);
  }

  const rawEntries: EnergyRankingEntry[] = [];

  for (const mon of candidateSpecies) {
    const isFinal = !mon.remainingEvolutions || mon.remainingEvolutions <= 0;
    if (onlyFinalEvolution && !isFinal) {
      continue;
    }

    let subskills: string[] = [];
    let nature: string | null = null;
    if (preset === 'optimal') {
      if (mon.specialty === 'skill') {
        subskills = OPTIMAL_SKILL_ENERGY_SUBSKILLS;
        nature = 'Brave'; // +Speed, -EXP
      } else if (mon.specialty === 'ingredient') {
        subskills = OPTIMAL_ING_ENERGY_SUBSKILLS;
        nature = 'Brave';
      } else {
        subskills = OPTIMAL_BERRY_SUBSKILLS;
        nature = 'Adamant'; // +Speed, -Ing
      }
    }

    const prod = calculateDailyProduction({
      pokemon: mon,
      level,
      nature,
      subskills,
      ingredientSelection: 'AAA',
      mainSkillLevel: mon.skill?.maxLevel || 6,
      isFavoredBerry,
      helpingBonusMode: 'individual25',
    });

    const metricScore = metric === 'total_energy' ? prod.totalDailyEnergy : prod.dailyBerryEnergy;

    rawEntries.push({
      pokemon: mon,
      level,
      specialty: mon.specialty,
      berry: mon.berry,
      dailyBerryEnergy: round(prod.dailyBerryEnergy, 0),
      dailyTotalEnergy: round(prod.totalDailyEnergy, 0),
      dailyHelps: round(prod.dailyHelps, 1),
      metricScore: round(metricScore, 0),
      isFinalEvolution: isFinal,
      isCurrentPokemon: false,
      subskillSummary:
        preset === 'optimal'
          ? mon.specialty === 'berry'
            ? '极品树果流 (BFS+HB+双速)'
            : '极品跨界流 (BFS+HB+特长加速)'
          : '中性白板基准',
      relativePercentage: 0,
    });
  }

  // Include current analyzed Pokémon if available
  if (currMon && currentPokemon) {
    const isFinal = !currMon.remainingEvolutions || currMon.remainingEvolutions <= 0;
    const currProd = calculateDailyProduction({
      pokemon: currMon,
      level: currentPokemon.level,
      nature: currentPokemon.nature || null,
      subskills: currentPokemon.subskills || [],
      ingredientSelection: currentPokemon.ingredientSelection || 'AAA',
      mainSkillLevel: currentPokemon.mainSkillLevel || currMon.skill?.maxLevel || 6,
      ribbonLevel: currentPokemon.ribbonLevel || 0,
      mewLearnedSkill: currentPokemon.mewLearnedSkill,
      isFavoredBerry,
      helpingBonusMode: 'individual25',
    });

    const metricScore =
      metric === 'total_energy' ? currProd.totalDailyEnergy : currProd.dailyBerryEnergy;

    rawEntries.push({
      pokemon: currMon,
      level: currentPokemon.level,
      specialty: currMon.specialty,
      berry: currMon.berry,
      dailyBerryEnergy: round(currProd.dailyBerryEnergy, 0),
      dailyTotalEnergy: round(currProd.totalDailyEnergy, 0),
      dailyHelps: round(currProd.dailyHelps, 1),
      metricScore: round(metricScore, 0),
      isFinalEvolution: isFinal,
      isCurrentPokemon: true,
      subskillSummary: `当前个体 (Lv.${currentPokemon.level})`,
      relativePercentage: 0,
    });
  }

  rawEntries.sort((a, b) => b.metricScore - a.metricScore);

  const maxScore = rawEntries.length > 0 ? Math.max(...rawEntries.map((e) => e.metricScore)) : 1;
  for (const e of rawEntries) {
    e.relativePercentage = maxScore > 0 ? round((e.metricScore / maxScore) * 100, 1) : 0;
  }

  let scopeDisplayName = '同树果产出竞争';
  if (scope === 'same_island' && targetIsland) {
    scopeDisplayName = `${targetIsland.translations['zh-CN'] || targetIsland.name} 喜好树果全员天梯`;
  } else if (scope === 'all_berry_mon') {
    scopeDisplayName =
      specialtyFilter === 'berry'
        ? '全游树果专长霸主榜'
        : specialtyFilter === 'skill'
        ? '全游技能专长能量榜'
        : specialtyFilter === 'ingredient'
        ? '全游食材专长能量榜'
        : '全游跨专长能量霸主榜';
  } else if (targetBerryObj) {
    scopeDisplayName = `${targetBerryObj.translations['zh-CN'] || targetBerry} 同树果跨专长天梯`;
  }

  return {
    scope,
    scopeDisplayName,
    targetBerry,
    targetBerryObj,
    targetIsland,
    specialtyFilter,
    metric,
    level,
    maxScore,
    entries: rawEntries,
  };
}

