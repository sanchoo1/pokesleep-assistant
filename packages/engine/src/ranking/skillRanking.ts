import {
  GAME_DATA,
  PokemonSpecies,
  Nature,
  Subskill,
} from '@pokesleep/data';
import { calculateDailyProduction } from '../production';

export type SkillRankingCategory =
  | 'healer' // 活力全队回复 (E4E / 新月祈祷 / 树果汁)
  | 'pot_expansion' // 料理扩锅 (料理强化S / 负电)
  | 'charge_strength' // 直接充能 (能量填充M/S / 蓄力 / 梦魇)
  | 'ingredient_draw' // 食材获取/抽选 (食材获取S / 抽选S / 超幸运 / 正电 / 礼物 / 怪力钳)
  | 'cooking_crit' // 料理暴击 (料理成功S)
  | 'helper_boost' // 帮手鼓舞/支援 (帮手鼓舞 / 帮手支援S)
  | 'all_skill_mon'; // 全技能专长总榜

export type SkillRankingMetric =
  | 'skill_procs' // 每日技能期望发动次数 (次/天)
  | 'skill_value' // 实际效果量化 (回复精力/扩锅容量/充能能量/抽选食材等)
  | 'total_energy'; // 全天总能量贡献 (树果+食材+技能)

export interface SkillRankingFilters {
  category?: SkillRankingCategory;
  metric?: SkillRankingMetric; // default 'skill_procs'
  level?: number; // default 50
  onlyFinalEvolution?: boolean; // default true
  preset?: 'optimal' | 'neutral'; // default 'optimal'
  currentPokemon?: {
    pokemonName: string;
    level: number;
    nature?: Nature | string | null;
    subskills?: Array<Subskill | string>;
    mainSkillLevel?: number;
    ribbonLevel?: number;
    ingredientSelection?: string;
    mewLearnedSkill?: string;
  };
}

export interface SkillRankingEntry {
  pokemon: PokemonSpecies;
  level: number;
  dailySkillProcs: number; // e.g. 6.57 次/天
  quantifiedValue: number; // e.g. 118.9 点全队精力 / +42 锅容量 / 18500 充能能量
  quantifiedUnit: string; // '点全队精力/天' | '容量/天' | '能量/天' | '个食材/天' | '%暴击率/天' | '次支援/天' | '次/天'
  quantifiedLabel: string; // '每日全队回复' | '每日扩锅' | '每日充能' | '每日抽选' | '每日成功率' | '每日支援'
  dailyTotalEnergy: number; // Total energy pts/day
  metricScore: number; // The score used for ranking sorting
  isFinalEvolution: boolean;
  isCurrentPokemon: boolean;
  subskillSummary: string;
  relativePercentage: number; // 0 to 100 relative to top rank
}

export interface SkillRankingResult {
  category: SkillRankingCategory;
  categoryDisplayName: string;
  metric: SkillRankingMetric;
  level: number;
  maxScore: number;
  entries: SkillRankingEntry[];
}

const OPTIMAL_SKILL_SUBSKILLS: string[] = [
  'Skill Trigger M',
  'Helping Bonus',
  'Helping Speed M',
  'Skill Trigger S',
  'Helping Speed S',
];

const OPTIMAL_SKILL_NATURE = 'Sassy'; // +Skill, -EXP

/**
 * Detects the most appropriate skill category for a given Pokémon species.
 */
export function detectSkillCategory(mon: PokemonSpecies): SkillRankingCategory {
  const sk = mon.skill?.name || '';
  const base = mon.skill?.baseSkillName || sk;

  if (base.includes('Energy For Everyone') || sk.includes('Energy For Everyone')) {
    return 'healer';
  }
  if (base.includes('Cooking Power-Up') || sk.includes('Cooking Power-Up')) {
    return 'pot_expansion';
  }
  if (base.includes('Charge Strength') || sk.includes('Charge Strength') || sk.includes('Bad Dreams') || sk.includes('Stockpile')) {
    return 'charge_strength';
  }
  if (base.includes('Ingredient Magnet') || base.includes('Ingredient Draw') || sk.includes('Ingredient') || sk.includes('Super Luck') || sk.includes('Plus') || sk.includes('Present')) {
    return 'ingredient_draw';
  }
  if (base.includes('Tasty Chance') || sk.includes('Tasty Chance')) {
    return 'cooking_crit';
  }
  if (base.includes('Helper Boost') || base.includes('Extra Helpful') || sk.includes('Helper Boost') || sk.includes('Extra Helpful')) {
    return 'helper_boost';
  }
  return 'all_skill_mon';
}

export const SKILL_CATEGORY_META: Record<
  SkillRankingCategory,
  {
    displayName: string;
    description: string;
    primaryUnit: string;
    primaryLabel: string;
  }
> = {
  healer: {
    displayName: '活力全队奶妈',
    description: '对比全游全队活力回复（E4E / 新月祈祷等）角色',
    primaryUnit: '点精力/天',
    primaryLabel: '每日全队回复',
  },
  pot_expansion: {
    displayName: '料理扩锅大师',
    description: '对比每日大胃王锅容量扩增（料理强化S / 负电等）',
    primaryUnit: '容量/天',
    primaryLabel: '每日扩锅容量',
  },
  charge_strength: {
    displayName: '直接充能爆发',
    description: '对比每日技能直接产出的卡比兽能量（能量填充S/M等）',
    primaryUnit: '能量/天',
    primaryLabel: '每日充能能量',
  },
  ingredient_draw: {
    displayName: '食材磁力/抽选',
    description: '对比每日通过技能获取额外食材的总量（食材获取S / 抽选S等）',
    primaryUnit: '份/天',
    primaryLabel: '每日技能产食材',
  },
  cooking_crit: {
    displayName: '料理美味成功',
    description: '对比每日为料理提供的暴击率增幅（料理成功S）',
    primaryUnit: '%累计率/天',
    primaryLabel: '每日累计暴击率',
  },
  helper_boost: {
    displayName: '帮手鼓舞/支援',
    description: '对比神兽帮手鼓舞与帮手支援提供的全队额外帮忙次数',
    primaryUnit: '次帮忙/天',
    primaryLabel: '每日额外帮忙',
  },
  all_skill_mon: {
    displayName: '全技能宠发动率总榜',
    description: '跨技能横向对比全游全部技能专长宠物的每日技能发动频率',
    primaryUnit: '次/天',
    primaryLabel: '每日期望发动',
  },
};

/**
 * Filter species belonging to the given skill category.
 */
function getSpeciesForCategory(category: SkillRankingCategory): PokemonSpecies[] {
  return GAME_DATA.pokemon.filter((p) => {
    if (category === 'all_skill_mon') {
      return p.specialty === 'skill';
    }
    const sk = p.skill?.name || '';
    const base = p.skill?.baseSkillName || sk;
    switch (category) {
      case 'healer':
        return base.includes('Energy For Everyone') || sk.includes('Energy For Everyone');
      case 'pot_expansion':
        return base.includes('Cooking Power-Up') || sk.includes('Cooking Power-Up');
      case 'charge_strength':
        return (
          base.includes('Charge Strength') ||
          sk.includes('Charge Strength') ||
          sk.includes('Bad Dreams') ||
          sk.includes('Stockpile')
        );
      case 'ingredient_draw':
        return (
          base.includes('Ingredient Magnet') ||
          base.includes('Ingredient Draw') ||
          sk.includes('Ingredient') ||
          sk.includes('Super Luck') ||
          sk.includes('Plus') ||
          sk.includes('Present')
        );
      case 'cooking_crit':
        return base.includes('Tasty Chance') || sk.includes('Tasty Chance');
      case 'helper_boost':
        return (
          base.includes('Helper Boost') ||
          base.includes('Extra Helpful') ||
          sk.includes('Helper Boost') ||
          sk.includes('Extra Helpful')
        );
      default:
        return false;
    }
  });
}

function extractQuantifiedSkillValue(
  prod: ReturnType<typeof calculateDailyProduction>,
  category: SkillRankingCategory
): { value: number; unit: string; label: string } {
  const meta = SKILL_CATEGORY_META[category];
  const procs = prod.dailySkillProcs;

  if (category === 'all_skill_mon') {
    return { value: round(procs, 2), unit: '次/天', label: '每日期望发动' };
  }

  const actDetails = prod.skillActivationDetails;
  if (category === 'healer') {
    // Total team energy: for E4E all 5 members restore
    const val = actDetails?.dailyTeamTotalOutput || procs * 5 * 18;
    return { value: round(val, 1), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  if (category === 'pot_expansion') {
    const val = actDetails?.dailyOutput || procs * 10;
    return { value: round(val, 1), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  if (category === 'charge_strength') {
    return { value: round(prod.dailySkillEnergy, 0), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  if (category === 'ingredient_draw') {
    const val = actDetails?.dailyOutput || prod.skillDailyIngredientCount || procs * 8;
    return { value: round(val, 1), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  if (category === 'cooking_crit') {
    const val = actDetails?.dailyOutput || procs * 5;
    return { value: round(val, 1), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  if (category === 'helper_boost') {
    const val = actDetails?.dailyTeamTotalOutput || actDetails?.dailyOutput || procs * 5;
    return { value: round(val, 1), unit: meta.primaryUnit, label: meta.primaryLabel };
  }

  return { value: round(procs, 2), unit: '次/天', label: '每日期望发动' };
}

function round(n: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

/**
 * Cross-species skill specialist benchmarking ladder.
 */
export function rankSkillSpecialists(filters: SkillRankingFilters): SkillRankingResult {
  const {
    category = 'healer',
    metric = 'skill_procs',
    level = 50,
    onlyFinalEvolution = true,
    preset = 'optimal',
    currentPokemon,
  } = filters;

  const candidateSpecies = getSpeciesForCategory(category);
  const rawEntries: SkillRankingEntry[] = [];

  for (const mon of candidateSpecies) {
    const isFinal = !mon.remainingEvolutions || mon.remainingEvolutions <= 0;
    if (onlyFinalEvolution && !isFinal) {
      continue;
    }

    const subskills = preset === 'optimal' ? OPTIMAL_SKILL_SUBSKILLS : [];
    const nature = preset === 'optimal' ? OPTIMAL_SKILL_NATURE : null;
    const maxSkillLevel = mon.skill?.maxLevel || 6;

    const prod = calculateDailyProduction({
      pokemon: mon,
      level,
      nature,
      subskills,
      ingredientSelection: 'AAA',
      mainSkillLevel: maxSkillLevel,
      helpingBonusMode: 'individual25',
    });

    const quant = extractQuantifiedSkillValue(prod, category);
    let metricScore = prod.dailySkillProcs;
    if (metric === 'skill_value') {
      metricScore = quant.value;
    } else if (metric === 'total_energy') {
      metricScore = prod.totalDailyEnergy;
    }

    rawEntries.push({
      pokemon: mon,
      level,
      dailySkillProcs: round(prod.dailySkillProcs, 2),
      quantifiedValue: quant.value,
      quantifiedUnit: quant.unit,
      quantifiedLabel: quant.label,
      dailyTotalEnergy: round(prod.totalDailyEnergy, 0),
      metricScore: round(metricScore, 2),
      isFinalEvolution: isFinal,
      isCurrentPokemon: false,
      subskillSummary:
        preset === 'optimal' ? '极品技能流 (双概率+双速+帮奖)' : '中性白板基准',
      relativePercentage: 0,
    });
  }

  // Include current analyzed Pokémon if available
  if (currentPokemon) {
    const currMon = GAME_DATA.pokemon.find(
      (p) =>
        p.name.toUpperCase() === currentPokemon.pokemonName.toUpperCase() ||
        p.displayName.toLowerCase() === currentPokemon.pokemonName.toLowerCase() ||
        p.translations['zh-CN'] === currentPokemon.pokemonName ||
        p.translations['zh-TW'] === currentPokemon.pokemonName
    );

    if (currMon) {
      const isFinal = !currMon.remainingEvolutions || currMon.remainingEvolutions <= 0;
      const currSkillLvl = currentPokemon.mainSkillLevel || currMon.skill?.maxLevel || 6;

      const currProd = calculateDailyProduction({
        pokemon: currMon,
        level: currentPokemon.level,
        nature: currentPokemon.nature || null,
        subskills: currentPokemon.subskills || [],
        ingredientSelection: currentPokemon.ingredientSelection || 'AAA',
        mainSkillLevel: currSkillLvl,
        ribbonLevel: currentPokemon.ribbonLevel || 0,
        mewLearnedSkill: currentPokemon.mewLearnedSkill,
        helpingBonusMode: 'individual25',
      });

      const quant = extractQuantifiedSkillValue(currProd, category);
      let metricScore = currProd.dailySkillProcs;
      if (metric === 'skill_value') {
        metricScore = quant.value;
      } else if (metric === 'total_energy') {
        metricScore = currProd.totalDailyEnergy;
      }

      rawEntries.push({
        pokemon: currMon,
        level: currentPokemon.level,
        dailySkillProcs: round(currProd.dailySkillProcs, 2),
        quantifiedValue: quant.value,
        quantifiedUnit: quant.unit,
        quantifiedLabel: quant.label,
        dailyTotalEnergy: round(currProd.totalDailyEnergy, 0),
        metricScore: round(metricScore, 2),
        isFinalEvolution: isFinal,
        isCurrentPokemon: true,
        subskillSummary: `当前个体 (Lv.${currentPokemon.level})`,
        relativePercentage: 0,
      });
    }
  }

  rawEntries.sort((a, b) => b.metricScore - a.metricScore);

  const maxScore = rawEntries.length > 0 ? Math.max(...rawEntries.map((e) => e.metricScore)) : 1;
  for (const e of rawEntries) {
    e.relativePercentage = maxScore > 0 ? round((e.metricScore / maxScore) * 100, 1) : 0;
  }

  return {
    category,
    categoryDisplayName: SKILL_CATEGORY_META[category]?.displayName || category,
    metric,
    level,
    maxScore,
    entries: rawEntries,
  };
}
