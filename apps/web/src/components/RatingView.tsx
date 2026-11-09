import React, { useState, useMemo, useEffect } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  RecipeType,
  MainskillUnit,
  getBerryImageUrl,
  getIngredientImageUrl,
  getRecipeImageUrl,
  getSkillImageUrl,
  getTypeImageUrl,
  getPokemonImageUrl,
} from '@pokesleep/data';
import {
  evaluatePokemonMilestones,
  calculateDailyProduction,
  analyzeIndividualRecipeCoverage,
  rankIngredientProducers,
  getSpecificIngredientYield,
  rankSkillSpecialists,
  rankEnergyProducers,
  detectSkillCategory,
  SKILL_CATEGORY_META,
  findIslandForBerry,
  type SkillRankingCategory,
  type SkillRankingMetric,
  type EnergyRankingScope,
  type EnergyRankingSpecialtyFilter,
  type EnergyRankingMetric,
  EvaluationMetric,
  CookingScenarioContext,
  MEW_LEARNED_SKILLS,
} from '@pokesleep/engine';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getNatureModLabel, getPokemonTypeLabel, getUIText } from '../i18n';
import { PokemonSelector } from './PokemonSelector';
import {
  Sparkles,
  Trophy,
  ShieldAlert,
  Award,
  Zap,
  Apple,
  Utensils,
  Flame,
  CheckCircle2,
  Moon,
  SlidersHorizontal,
  Clock,
  Package,
  BedDouble,
  Info,
  Lock,
  BarChart3,
} from 'lucide-react';

interface RatingViewProps {
  initialPokemon?: BoxPokemon | null;
  locale: SupportedLocale;
  onClearInitial?: () => void;
}

const COOKING_SCENARIOS: Array<{
  id: string;
  name: string;
  dishEnergyBaseline: number;
  fillerEnergyPerSlot: number;
  recipeMultiplier: number;
  badge: string;
  description: string;
}> = [
  {
    id: 'standard',
    name: '通用标准基线 (单餐 3.5万 / 扩锅每格+135)',
    dishEnergyBaseline: 35000,
    fillerEnergyPerSlot: 135,
    recipeMultiplier: 1.0,
    badge: '社区基准',
    description: '单餐约 35,000 能量 / 填充格等效 +135 基础能量',
  },
  {
    id: 'mid',
    name: '日常中阶食谱 (单餐 2.2万 / 填充+144)',
    dishEnergyBaseline: 22000,
    fillerEnergyPerSlot: 115,
    recipeMultiplier: 1.25,
    badge: '中阶家常',
    description: '单餐约 22,000 能量 / 填充格等效 +144 能量 (Lv.30 食谱加成)',
  },
  {
    id: 'tier77',
    name: '顶级 77/80格食谱 (单餐 5.5万 / 填充+207)',
    dishEnergyBaseline: 55000,
    fillerEnergyPerSlot: 140,
    recipeMultiplier: 1.48,
    badge: '炼狱/早起/忍者',
    description: '单餐约 55,000 能量 / 填充格等效 +207 能量 (Lv.55+ 顶级食谱加成)',
  },
  {
    id: 'mega_tail',
    name: '极限尾巴扩锅核弹 (单餐 8.5万 / 尾巴+506)',
    dishEnergyBaseline: 85000,
    fillerEnergyPerSlot: 342,
    recipeMultiplier: 1.48,
    badge: '尾巴扩锅',
    description: '单餐约 85,000 能量 / 填充慢速呆呆兽尾巴 +506 能量',
  },
];

const SKILL_UNIT_LABELS: Record<MainskillUnit, { label: string; unitSuffix: string }> = {
  berries: { label: '技能树果产出', unitSuffix: '颗树果' },
  energy: { label: '活力回复量', unitSuffix: '点活力' },
  strength: { label: '直接卡比兽能量', unitSuffix: '能量' },
  ingredients: { label: '技能额外食材', unitSuffix: '个食材' },
  'pot size': { label: '料理锅容量扩充', unitSuffix: '格容量' },
  helps: { label: '额外帮手帮忙', unitSuffix: '次帮忙' },
  'skill helps': { label: '技能帮忙触发', unitSuffix: '次' },
  'dream shards': { label: '梦之碎片获取', unitSuffix: '碎片' },
  'crit chance': { label: '料理大成功暴击率', unitSuffix: '% 暴击' },
  'berry zone': { label: '树果领域加成', unitSuffix: '次领域' },
  candy: { label: '糖果产出', unitSuffix: '颗糖果' },
  items: { label: '道具获取', unitSuffix: '个道具' },
};

const isFixedNaturePokemon = (name?: string): boolean => {
  const u = (name || '').toUpperCase();
  return u === 'MEW' || u === 'DARKRAI';
};

export const RatingView: React.FC<RatingViewProps> = ({ initialPokemon, locale }) => {
  const [selectedSpecies, setSelectedSpecies] = useState(
    initialPokemon?.pokemonName || 'PIKACHU'
  );
  const [natureName, setNatureName] = useState(
    isFixedNaturePokemon(initialPokemon?.pokemonName) ? 'Bashful' : initialPokemon?.nature || 'Adamant'
  );
  const [subskills, setSubskills] = useState(() =>
    initialPokemon
      ? normalizeBoxSubskills(initialPokemon.subskills)
      : {
          level10: 'Berry Finding S',
          level25: 'Helping Speed M',
          level50: 'Skill Trigger M',
          level70: 'Helping Bonus',
          level80: '',
        }
  );
  const [ingredients, setIngredients] = useState({
    slotA: initialPokemon?.ingredients?.slotA || 'Apple',
    slotB: initialPokemon?.ingredients?.slotB || 'Apple',
    slotC: initialPokemon?.ingredients?.slotC || 'Apple',
  });
  const [mainSkillLevel, setMainSkillLevel] = useState(initialPokemon?.mainSkillLevel || 1);
  const [ribbonLevel, setRibbonLevel] = useState(initialPokemon?.ribbonLevel || 0);
  const [simulateMaxSkillSeed, setSimulateMaxSkillSeed] = useState(false);
  const [isFavoredBerry, setIsFavoredBerry] = useState(true);
  const [mapBonus, setMapBonus] = useState(0);
  const [metric, setMetric] = useState<EvaluationMetric>('auto');
  const [mewLearnedSkill, setMewLearnedSkill] = useState<string>(
    initialPokemon?.mewLearnedSkill || 'Metronome'
  );

  const species = useMemo(() => {
    return (
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === selectedSpecies.toUpperCase()
      ) || GAME_DATA.pokemon[0]
    );
  }, [selectedSpecies]);

  const isMythicalFixed = isFixedNaturePokemon(species.name);
  const effectiveNature = isMythicalFixed ? 'Bashful' : natureName;

  // Inspected milestone stage in detail panel (auto-selected by specialty, clickable by user)
  const [focusedLevel, setFocusedLevel] = useState<number>(60);
  const [activeDeepTab, setActiveDeepTab] = useState<'berry' | 'ingredient' | 'skill' | 'overnight'>(
    species.specialty === 'all' ? 'skill' : species.specialty
  );
  const [recipeDishTab, setRecipeDishTab] = useState<RecipeType>('curry');

  // Target Ingredient selection for granular production breakdown & cross-species benchmark ranking
  const [selectedTargetIngredient, setSelectedTargetIngredient] = useState<string>('');
  const [rankingLevel, setRankingLevel] = useState<number>(60);
  const [rankingOnlyFinalEvolution, setRankingOnlyFinalEvolution] = useState<boolean>(true);
  const [rankingOnlyAAA, setRankingOnlyAAA] = useState<boolean>(false);
  const [rankingPreset, setRankingPreset] = useState<'optimal' | 'neutral'>('optimal');

  // Skill Specialist Ranking states
  const [skillRankingCategory, setSkillRankingCategory] = useState<SkillRankingCategory>(() =>
    detectSkillCategory(species)
  );
  const [skillRankingMetric, setSkillRankingMetric] = useState<SkillRankingMetric>('skill_procs');
  const [skillRankingLevel, setSkillRankingLevel] = useState<number>(50);
  const [skillRankingOnlyFinalEvolution, setSkillRankingOnlyFinalEvolution] = useState<boolean>(true);

  // Energy & Island Ranking states (Meganium vs Sceptile flexible benchmarking)
  const [energyRankingScope, setEnergyRankingScope] = useState<EnergyRankingScope>('same_berry');
  const [energyRankingSpecialtyFilter, setEnergyRankingSpecialtyFilter] = useState<EnergyRankingSpecialtyFilter>('all');
  const [energyRankingMetric, setEnergyRankingMetric] = useState<EnergyRankingMetric>('berry_energy');
  const [energyRankingLevel, setEnergyRankingLevel] = useState<number>(50);
  const [energyRankingOnlyFinalEvolution, setEnergyRankingOnlyFinalEvolution] = useState<boolean>(true);

  // Cooking strength scenario configuration for realistic pot expansion and crit chance
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('standard');
  const [customDishEnergy, setCustomDishEnergy] = useState<number>(35000);
  const [customFillerEnergy, setCustomFillerEnergy] = useState<number>(135);
  const [sleepDurationHours, setSleepDurationHours] = useState<number>(8.5);

  const activeCookingContext: CookingScenarioContext = useMemo(() => {
    if (selectedScenarioId === 'custom') {
      return {
        scenarioName: '自定义单餐参数',
        dishEnergyBaseline: customDishEnergy,
        fillerEnergyPerSlot: customFillerEnergy,
        recipeMultiplier: 1.0,
      };
    }
    const found = COOKING_SCENARIOS.find((s) => s.id === selectedScenarioId) || COOKING_SCENARIOS[0];
    return {
      scenarioName: found.name,
      dishEnergyBaseline: found.dishEnergyBaseline,
      fillerEnergyPerSlot: found.fillerEnergyPerSlot,
      recipeMultiplier: found.recipeMultiplier,
    };
  }, [selectedScenarioId, customDishEnergy, customFillerEnergy]);

  // Sync when navigating from BoxManager "Analyze" button
  useEffect(() => {
    if (!initialPokemon) return;
    const sp =
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === initialPokemon.pokemonName.toUpperCase()
      ) || GAME_DATA.pokemon[0];
    setSelectedSpecies(sp.name);
    setNatureName(isFixedNaturePokemon(sp.name) ? 'Bashful' : initialPokemon.nature || 'Adamant');
    setSubskills(normalizeBoxSubskills(initialPokemon.subskills));
    setIngredients({
      slotA: initialPokemon.ingredients?.slotA || sp.ingredient0?.[0]?.ingredient || 'Apple',
      slotB: initialPokemon.ingredients?.slotB || sp.ingredient30?.[0]?.ingredient || 'Locked',
      slotC: initialPokemon.ingredients?.slotC || sp.ingredient60?.[0]?.ingredient || 'Locked',
    });
    setMainSkillLevel(initialPokemon.mainSkillLevel || 1 + (sp.previousEvolutions || 0));
    setRibbonLevel(initialPokemon.ribbonLevel || 0);
    if (initialPokemon.mewLearnedSkill) {
      setMewLearnedSkill(initialPokemon.mewLearnedSkill);
    }
    setActiveDeepTab(sp.specialty === 'all' ? 'skill' : sp.specialty);
    setFocusedLevel(sp.specialty === 'ingredient' ? 60 : 50);
    setSkillRankingCategory(detectSkillCategory(sp));
  }, [initialPokemon]);

  const handleSpeciesChange = (newSpeciesName: string) => {
    setSelectedSpecies(newSpeciesName);
    const sp = GAME_DATA.pokemon.find(
      (p) => p.name.toUpperCase() === newSpeciesName.toUpperCase()
    );
    if (sp) {
      if (isFixedNaturePokemon(sp.name)) {
        setNatureName('Bashful');
      }
      if (sp.name.toUpperCase() === 'MEW') {
        setMewLearnedSkill('Metronome');
      }
      const validA = (sp.ingredient0 || []).map((i) => i.ingredient).filter((x) => x !== 'Locked');
      const validB = (sp.ingredient30 || []).map((i) => i.ingredient);
      const validC = (sp.ingredient60 || []).map((i) => i.ingredient);

      setIngredients({
        slotA: validA[0] || 'Apple',
        slotB: validB.includes('Locked') ? 'Locked' : validB[0] || 'Locked',
        slotC: validC.includes('Locked') ? 'Locked' : validC[0] || 'Locked',
      });
      setMainSkillLevel(Math.min(sp.skill.maxLevel || 6, 1 + (sp.previousEvolutions || 0)));
      setActiveDeepTab(sp.specialty === 'all' ? 'skill' : sp.specialty);
      setFocusedLevel(sp.specialty === 'ingredient' ? 60 : 50);
      setSkillRankingCategory(detectSkillCategory(sp));
    }
  };

  const validSlotA = useMemo(
    () => (species.ingredient0 || []).filter((i) => i.ingredient !== 'Locked'),
    [species]
  );
  const validSlotB = useMemo(() => {
    const list = species.ingredient30 || [];
    const hasLocked = list.some((i) => i.ingredient === 'Locked');
    return hasLocked ? list : [...list, { ingredient: 'Locked', amount: 0 }];
  }, [species]);
  const validSlotC = useMemo(() => {
    const list = species.ingredient60 || [];
    const hasLocked = list.some((i) => i.ingredient === 'Locked');
    return hasLocked ? list : [...list, { ingredient: 'Locked', amount: 0 }];
  }, [species]);

  // Ensure ingredient slots always stay valid for current species
  useEffect(() => {
    setIngredients((prev) => {
      const validA = validSlotA.map((i) => i.ingredient);
      const validB = validSlotB.map((i) => i.ingredient);
      const validC = validSlotC.map((i) => i.ingredient);

      const safeA = validA.includes(prev.slotA) ? prev.slotA : (validA[0] || 'Apple');
      const safeB =
        prev.slotB === 'Locked' || validB.includes(prev.slotB || '')
          ? prev.slotB
          : (validB[0] || 'Locked');
      const safeC =
        prev.slotC === 'Locked' || validC.includes(prev.slotC || '')
          ? prev.slotC
          : (validC[0] || 'Locked');

      if (safeA !== prev.slotA || safeB !== prev.slotB || safeC !== prev.slotC) {
        return { slotA: safeA, slotB: safeB, slotC: safeC };
      }
      return prev;
    });
  }, [validSlotA, validSlotB, validSlotC]);

  const effectiveInputSkillLevel = simulateMaxSkillSeed
    ? species.skill.maxLevel || 6
    : mainSkillLevel;

  // Automatic Multi-Stage Evaluation across [10, 25, 30, 50, 60, 70, 80]
  const multiReport = useMemo(() => {
    try {
      return evaluatePokemonMilestones({
        pokemon: species,
        nature: effectiveNature,
        subskills,
        ingredientSelection: {
          slot0: ingredients.slotA,
          slot30: ingredients.slotB,
          slot60: ingredients.slotC,
        },
        mainSkillLevel: effectiveInputSkillLevel,
        ribbonLevel,
        metric,
        isFavoredBerry,
        mapBonus,
        previewLv80: true,
        cookingContext: activeCookingContext,
        sleepHours: sleepDurationHours,
        mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [
    species,
    effectiveNature,
    subskills,
    ingredients,
    effectiveInputSkillLevel,
    ribbonLevel,
    metric,
    isFavoredBerry,
    mapBonus,
    activeCookingContext,
    sleepDurationHours,
    mewLearnedSkill,
  ]);

  const standardMilestones = useMemo(() => {
    return (multiReport?.milestones || []).filter((m) => m.level <= 70);
  }, [multiReport]);

  const standardAveragePercentile = useMemo(() => {
    if (!standardMilestones.length) return 0;
    const sum = standardMilestones.reduce((acc, m) => acc + m.rating.percentile, 0);
    return Math.round((sum / standardMilestones.length) * 10) / 10;
  }, [standardMilestones]);

  const standardPeakStage = useMemo(() => {
    if (!standardMilestones.length) return multiReport?.peakStage || null;
    let peak = standardMilestones[0];
    for (const m of standardMilestones) {
      if (m.rating.percentile >= peak.rating.percentile) {
        peak = m;
      }
    }
    return peak;
  }, [standardMilestones, multiReport]);

  const focusedStage = useMemo(() => {
    if (!multiReport) return null;
    return (
      multiReport.milestones.find((m) => m.level === focusedLevel) ||
      multiReport.milestones[multiReport.milestones.length - 1]
    );
  }, [multiReport, focusedLevel]);

  const focusedProd = focusedStage?.rating.currentProduction || null;

  // Compare favored vs unfavored berry production at focusedLevel for Berry Deep-Dive
  const berryComparison = useMemo(() => {
    if (!focusedProd) return null;
    const favored = calculateDailyProduction({
      pokemon: species,
      level: focusedLevel,
      nature: effectiveNature,
      subskills,
      ingredientSelection: {
        slot0: ingredients.slotA,
        slot30: ingredients.slotB,
        slot60: ingredients.slotC,
      },
      mainSkillLevel: effectiveInputSkillLevel,
      ribbonLevel,
      isFavoredBerry: true,
      mapBonus,
      mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
    });
    const unfavored = calculateDailyProduction({
      pokemon: species,
      level: focusedLevel,
      nature: effectiveNature,
      subskills,
      ingredientSelection: {
        slot0: ingredients.slotA,
        slot30: ingredients.slotB,
        slot60: ingredients.slotC,
      },
      mainSkillLevel: effectiveInputSkillLevel,
      ribbonLevel,
      isFavoredBerry: false,
      mapBonus,
      mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
    });
    return { favored, unfavored };
  }, [
    focusedProd,
    species,
    focusedLevel,
    effectiveNature,
    subskills,
    ingredients,
    effectiveInputSkillLevel,
    ribbonLevel,
    mapBonus,
    mewLearnedSkill,
  ]);

  // Memoized comparison of all 12 learned skills for Mew at focusedLevel
  const mewSkillComparison = useMemo(() => {
    if (species.name !== 'MEW') return [];
    return MEW_LEARNED_SKILLS.map((sk) => {
      const prod = calculateDailyProduction({
        pokemon: species,
        level: focusedLevel,
        nature: 'Bashful',
        subskills,
        ingredientSelection: {
          slot0: ingredients.slotA,
          slot30: ingredients.slotB,
          slot60: ingredients.slotC,
        },
        mainSkillLevel: effectiveInputSkillLevel,
        ribbonLevel,
        isFavoredBerry,
        mapBonus,
        cookingContext: activeCookingContext,
        sleepHours: sleepDurationHours,
        mewLearnedSkill: sk.id,
      });

      const skillEnergy = prod.dailySkillEnergy;
      const totalEnergy = prod.totalDailyEnergy;
      const dailyProcs = prod.dailySkillProcs;
      const candyItem = prod.skillActivationDetails.activations.find((b) => b.key === 'candy');
      const dailyCandies = candyItem?.dailySelf || dailyProcs;

      let keyOutputText = '';
      switch (sk.roleType) {
        case 'healer':
          if (sk.id.includes('Everyone')) {
            keyOutputText = `全队回体约 ${(dailyProcs * (11 + effectiveInputSkillLevel)).toFixed(0)} 点/天`;
          } else {
            keyOutputText = `单体急救约 ${(dailyProcs * 25).toFixed(0)} 活力/天`;
          }
          break;
        case 'ingredient':
          keyOutputText = `食材补给约 +${(dailyProcs * (6 + effectiveInputSkillLevel * 3)).toFixed(1)} 个/天`;
          break;
        case 'strength':
          keyOutputText = `技能能量约 +${Math.round(skillEnergy).toLocaleString()} /天`;
          break;
        case 'pot':
          keyOutputText = `单餐扩锅 +${7 + effectiveInputSkillLevel * 3} 容量`;
          break;
        case 'crit':
          keyOutputText = `料理暴击率 +${(4 + effectiveInputSkillLevel * 1.5).toFixed(1)}% /次`;
          break;
        case 'helps':
          keyOutputText = `日助攻队友 +${(dailyProcs * 4).toFixed(1)} 次瞬间帮忙`;
          break;
        case 'berries':
          keyOutputText = `日喷发 +${(dailyProcs * 6).toFixed(1)} 颗额外树果`;
          break;
        case 'shards':
          keyOutputText = `日产出 +${Math.round(dailyProcs * 1200)} 梦之碎片`;
          break;
        default:
          keyOutputText = `随机技能触发期望`;
          break;
      }

      return {
        ...sk,
        dailyProcs,
        dailyCandies,
        skillEnergy,
        totalEnergy,
        keyOutputText,
        isCurrent: sk.id === mewLearnedSkill,
      };
    });
  }, [
    species,
    focusedLevel,
    subskills,
    ingredients,
    effectiveInputSkillLevel,
    ribbonLevel,
    isFavoredBerry,
    mapBonus,
    activeCookingContext,
    sleepDurationHours,
    mewLearnedSkill,
  ]);

  // Recipe coverage at focusedLevel (defaults to Lv.60 if focusedLevel < 60 toggleable, or actual focusedProd)
  const focusedRecipeCoverage = useMemo(() => {
    if (!focusedProd) return null;
    return analyzeIndividualRecipeCoverage(focusedProd, 100);
  }, [focusedProd]);

  const availableIngredientsForSpecies = useMemo(() => {
    const list: string[] = [];
    const add = (ing?: string) => {
      if (ing && ing !== 'Locked' && !list.includes(ing)) list.push(ing);
    };
    add(ingredients.slotA);
    add(ingredients.slotB);
    add(ingredients.slotC);
    (species.ingredient0 || []).forEach((i) => add(i.ingredient));
    (species.ingredient30 || []).forEach((i) => add(i.ingredient));
    (species.ingredient60 || []).forEach((i) => add(i.ingredient));
    return list;
  }, [species, ingredients]);

  const effectiveTargetIngredient = useMemo(() => {
    if (selectedTargetIngredient) return selectedTargetIngredient;
    return availableIngredientsForSpecies[0] || 'Apple';
  }, [selectedTargetIngredient, availableIngredientsForSpecies]);

  const targetIngObj = useMemo(() => {
    return GAME_DATA.ingredients.find(
      (i) => i.name.toLowerCase() === effectiveTargetIngredient.toLowerCase()
    );
  }, [effectiveTargetIngredient]);

  const currentSpecificYield = useMemo(() => {
    if (!focusedProd || !effectiveTargetIngredient) return null;
    return getSpecificIngredientYield(focusedProd, effectiveTargetIngredient);
  }, [focusedProd, effectiveTargetIngredient]);

  const targetRecipesSupport = useMemo(() => {
    if (!currentSpecificYield || !effectiveTargetIngredient) return [];
    const targetLower = effectiveTargetIngredient.toLowerCase();
    const matches: Array<{
      recipe: (typeof GAME_DATA.recipes)[0];
      reqPerMeal: number;
      mealsPerDay: number;
    }> = [];
    for (const r of GAME_DATA.recipes) {
      const ingReq = r.ingredients.find((i) => i.ingredient.toLowerCase() === targetLower);
      if (ingReq && ingReq.amount > 0) {
        const mealsPerDay = currentSpecificYield.dailyYield / ingReq.amount;
        matches.push({ recipe: r, reqPerMeal: ingReq.amount, mealsPerDay });
      }
    }
    matches.sort((a, b) => b.recipe.value - a.recipe.value);
    return matches.slice(0, 4);
  }, [currentSpecificYield, effectiveTargetIngredient]);

  const ingredientRankingResult = useMemo(() => {
    if (!effectiveTargetIngredient) return null;
    return rankIngredientProducers({
      targetIngredient: effectiveTargetIngredient,
      level: rankingLevel,
      onlyFinalEvolution: rankingOnlyFinalEvolution,
      onlyAAA: rankingOnlyAAA,
      preset: rankingPreset,
      currentPokemon: {
        pokemonName: species.name,
        level: focusedLevel,
        nature: effectiveNature,
        subskills: Object.values(subskills).filter(Boolean),
        ingredients,
        ribbonLevel,
        mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
      },
    });
  }, [
    effectiveTargetIngredient,
    rankingLevel,
    rankingOnlyFinalEvolution,
    rankingOnlyAAA,
    rankingPreset,
    species.name,
    focusedLevel,
    effectiveNature,
    subskills,
    ingredients,
    ribbonLevel,
    mewLearnedSkill,
  ]);

  const skillRankingResult = useMemo(() => {
    return rankSkillSpecialists({
      category: skillRankingCategory,
      metric: skillRankingMetric,
      level: skillRankingLevel,
      onlyFinalEvolution: skillRankingOnlyFinalEvolution,
      currentPokemon: {
        pokemonName: species.name,
        level: focusedLevel,
        nature: effectiveNature,
        subskills: Object.values(subskills).filter(Boolean),
        mainSkillLevel,
        ribbonLevel,
        ingredientSelection: `${ingredients.slotA}${ingredients.slotB}${ingredients.slotC}`,
        mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
      },
    });
  }, [
    skillRankingCategory,
    skillRankingMetric,
    skillRankingLevel,
    skillRankingOnlyFinalEvolution,
    species.name,
    focusedLevel,
    effectiveNature,
    subskills,
    mainSkillLevel,
    ribbonLevel,
    ingredients,
    mewLearnedSkill,
  ]);

  const energyRankingResult = useMemo(() => {
    return rankEnergyProducers({
      scope: energyRankingScope,
      targetBerry: species.berry,
      specialtyFilter: energyRankingSpecialtyFilter,
      metric: energyRankingMetric,
      level: energyRankingLevel,
      onlyFinalEvolution: energyRankingOnlyFinalEvolution,
      isFavoredBerry: true,
      currentPokemon: {
        pokemonName: species.name,
        level: focusedLevel,
        nature: effectiveNature,
        subskills: Object.values(subskills).filter(Boolean),
        ingredientSelection: `${ingredients.slotA}${ingredients.slotB}${ingredients.slotC}`,
        mainSkillLevel,
        ribbonLevel,
        mewLearnedSkill: species.name === 'MEW' ? mewLearnedSkill : undefined,
      },
    });
  }, [
    energyRankingScope,
    species.berry,
    species.name,
    energyRankingSpecialtyFilter,
    energyRankingMetric,
    energyRankingLevel,
    energyRankingOnlyFinalEvolution,
    focusedLevel,
    effectiveNature,
    subskills,
    ingredients,
    mainSkillLevel,
    ribbonLevel,
    mewLearnedSkill,
  ]);

  const berryObj = useMemo(() => {
    return GAME_DATA.berries.find(
      (b) => b.name.toUpperCase() === species.berry.toUpperCase()
    );
  }, [species]);

  const prColor = (pr: number) => {
    if (pr >= 90) return 'text-amber-500';
    if (pr >= 75) return 'text-blue-600';
    if (pr >= 50) return 'text-emerald-600';
    return 'text-slate-500';
  };

  const gradeBadgeStyle = (grade: string) => {
    if (grade === 'S+') return 'bg-amber-500 text-white';
    if (grade === 'S') return 'bg-amber-100 text-amber-800 border border-amber-300';
    if (grade === 'A') return 'bg-blue-100 text-blue-800 border border-blue-300';
    if (grade === 'B') return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  };

  const metricLabel = (m: string) => {
    switch (m) {
      case 'berry_energy':
        return '每日树果能量';
      case 'ingredient_energy':
        return '每日食材能量';
      case 'ingredient_count':
        return '每日食材总产量';
      case 'skill_procs':
        return '每日技能期望触发次数';
      case 'skill_energy':
        return '每日技能折算能量';
      default:
        return '每日综合总能量';
    }
  };

  const maxSkillLvl = species.skill.maxLevel || 6;

  return (
    <div className="space-y-6">
      {/* Top Card: Configuration + Auto Multi-Stage PR Matrix */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">
              全阶段个体综合评估 (自动覆盖 Lv.10 – Lv.70)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            无需填写当前等级，自动推演各副技能与食材槽解锁阶段表现（当前游戏上限 Lv.70）
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (4 cols): Individual Config */}
          <div className="lg:col-span-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                选择宝可梦 (支持属性 / 专长 / 食材多维筛选)
              </label>
              <PokemonSelector
                value={selectedSpecies}
                onChange={handleSpeciesChange}
                locale={locale}
              />
            </div>

            {/* Nature & Evaluation Metric */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {getUIText('nature', locale)}
                </label>
                <select
                  value={effectiveNature}
                  disabled={isMythicalFixed}
                  onChange={(e) => setNatureName(e.target.value)}
                  className={`input-field text-xs py-1.5 ${
                    isMythicalFixed
                      ? 'bg-slate-50 text-slate-500 cursor-not-allowed border-slate-200'
                      : ''
                  }`}
                >
                  {GAME_DATA.natures.map((n) => (
                    <option key={n.name} value={n.name}>
                      {getEntityName(n, locale)}
                      {n.positiveModifier && n.positiveModifier !== 'neutral'
                        ? ` (▲${getNatureModLabel(n.positiveModifier, locale)} ▼${getNatureModLabel(n.negativeModifier, locale)})`
                        : ' (中性)'}
                    </option>
                  ))}
                </select>
                {isMythicalFixed && (
                  <p className="text-[10px] text-blue-700 mt-1 flex items-center font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 shrink-0" />
                    幻之宝可梦固定性格：害羞（Bashful）
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PR 评分维度
                </label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as EvaluationMetric)}
                  className="input-field text-xs py-1.5"
                >
                  <option value="auto">自动匹配专长 (推荐)</option>
                  <option value="total_energy">每日综合总能量</option>
                  <option value="berry_energy">纯树果能量</option>
                  <option value="ingredient_energy">食材能量产出</option>
                  <option value="ingredient_count">食材数量产出</option>
                  <option value="skill_procs">技能触发次数</option>
                  <option value="skill_energy">技能等效总价值</option>
                </select>
              </div>
            </div>

            {/* Mew's Unique Versatile Skill Selector (灵感之种) */}
            {species.name === 'MEW' && (
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 mr-1" />
                    十项全能 · 灵感之种已习得技能
                  </span>
                  <span className="text-[10px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-semibold">
                    灵感之种
                  </span>
                </div>
                <select
                  value={mewLearnedSkill}
                  onChange={(e) => setMewLearnedSkill(e.target.value)}
                  className="input-field text-xs py-1.5 bg-white border-blue-300 font-semibold text-slate-800"
                >
                  {MEW_LEARNED_SKILLS.map((item) => (
                    <option key={item.id} value={item.id}>
                      [{item.role}] {locale === 'en' ? item.name : item.nameZh}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-blue-800/90 leading-tight">
                  ✨ <strong>双重触发机制</strong>：每次发动必得队伍糖果，并触发「{MEW_LEARNED_SKILLS.find(s => s.id === mewLearnedSkill)?.nameZh || mewLearnedSkill}」效果。
                </div>
              </div>
            )}

            {/* 5 Subskills: Lv.10, 25, 50, 70, 80 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                副技能配置 (Lv.10 / 25 / 50 / 70，Lv.80 暂未开放上限)
              </label>
              <div className="space-y-1.5">
                {(
                  [
                    { lvl: 10, key: 'level10' as const, capLocked: false },
                    { lvl: 25, key: 'level25' as const, capLocked: false },
                    { lvl: 50, key: 'level50' as const, capLocked: false },
                    { lvl: 70, key: 'level70' as const, capLocked: false },
                    { lvl: 80, key: 'level80' as const, capLocked: true },
                  ]
                ).map(({ lvl, key, capLocked }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-bold w-16 shrink-0 ${
                        capLocked
                          ? focusedLevel === 80
                            ? 'text-blue-600'
                            : 'text-slate-400'
                          : lvl <= focusedLevel
                            ? 'text-blue-600'
                            : 'text-slate-600'
                      }`}
                    >
                      {capLocked ? 'Lv.80' : `Lv.${lvl}`}
                    </span>
                    <select
                      value={subskills[key]}
                      onChange={(e) => setSubskills({ ...subskills, [key]: e.target.value })}
                      className={`input-field text-xs py-1 ${capLocked ? 'bg-slate-50 text-slate-500' : ''}`}
                    >
                      <option value="">(无 / 未设置)</option>
                      {GAME_DATA.subskills.map((s) => {
                        const isUsedInOtherSlot = Object.entries(subskills).some(
                          ([k, v]) => k !== key && v === s.name
                        );
                        return (
                          <option key={s.name} value={s.name} disabled={isUsedInOtherSlot}>
                            [{s.rarity === 'gold' ? '金' : s.rarity === 'silver' ? '银' : '白'}] {getEntityName(s, locale)}{isUsedInOtherSlot ? (locale === 'en' ? ' (Selected)' : ' (已选)') : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients A / B / C with Official Icons */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                食材槽配置 (A: Lv.1 / B: Lv.30 / C: Lv.60)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Lv.1 (A)', key: 'slotA' as const, list: validSlotA },
                  { label: 'Lv.30 (B)', key: 'slotB' as const, list: validSlotB },
                  { label: 'Lv.60 (C)', key: 'slotC' as const, list: validSlotC },
                ].map(({ label, key, list }) => {
                  const rawIng = ingredients[key];
                  const selectedIng = list.some((i) => i.ingredient === rawIng)
                    ? rawIng
                    : (list[0]?.ingredient || rawIng);
                  return (
                    <div key={key} className="p-1.5 rounded-lg border border-slate-200 bg-slate-50/70">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                        {selectedIng && selectedIng !== 'Locked' ? (
                          <img
                            src={getIngredientImageUrl(selectedIng)}
                            alt={selectedIng}
                            className="w-4 h-4 object-contain"
                          />
                        ) : selectedIng === 'Locked' ? (
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        ) : null}
                      </div>
                      <select
                        value={selectedIng}
                        onChange={(e) => setIngredients({ ...ingredients, [key]: e.target.value })}
                        className="input-field text-xs py-1 bg-white px-1.5"
                      >
                        {list.map((item) => {
                          const isLocked = item.ingredient === 'Locked';
                          const ingObj = GAME_DATA.ingredients.find(
                            (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                          );
                          return (
                            <option key={item.ingredient} value={item.ingredient}>
                              {isLocked
                                ? (locale === 'en' ? '🔒 (Locked / Empty)' : '🔒 (未解锁 / 空)')
                                : `${ingObj ? getEntityName(ingObj, locale) : item.ingredient} ×${item.amount}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Skill Level + Island / Favored Berry Toggles */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center space-x-1">
                  <img
                    src={getSkillImageUrl(species.skill.image)}
                    alt=""
                    className="w-4 h-4 object-contain"
                  />
                  <span>基础主技能等级:</span>
                </span>
                <div className="flex items-center space-x-2">
                  <select
                    value={mainSkillLevel}
                    disabled={simulateMaxSkillSeed}
                    onChange={(e) => setMainSkillLevel(Number(e.target.value))}
                    className="input-field text-xs py-0.5 w-20 bg-white"
                  >
                    {Array.from({ length: maxSkillLvl }, (_, i) => i + 1).map((l) => (
                      <option key={l} value={l}>
                        Lv.{l}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center space-x-1 cursor-pointer text-indigo-700 font-medium">
                    <input
                      type="checkbox"
                      checked={simulateMaxSkillSeed}
                      onChange={(e) => setSimulateMaxSkillSeed(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>满级金瓜子</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                <span className="font-semibold text-slate-700 flex items-center space-x-1">
                  <span>🎖️ {getUIText('ribbonTitle', locale)}:</span>
                </span>
                <select
                  value={ribbonLevel}
                  onChange={(e) => setRibbonLevel(Number(e.target.value))}
                  className="input-field text-xs py-0.5 w-auto bg-white"
                >
                  <option value={0}>{getUIText('ribbonLevel0', locale)}</option>
                  <option value={1}>{getUIText('ribbonLevel1', locale)}</option>
                  <option value={2}>{getUIText('ribbonLevel2', locale)}</option>
                  <option value={3}>{getUIText('ribbonLevel3', locale)}</option>
                  <option value={4}>{getUIText('ribbonLevel4', locale)}</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                <label className="inline-flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isFavoredBerry}
                    onChange={(e) => setIsFavoredBerry(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>适性树果 (能量 ×2)</span>
                </label>

                <div className="flex items-center space-x-1">
                  <span className="text-slate-600">岛屿加成:</span>
                  <input
                    type="number"
                    min={0}
                    max={85}
                    step={5}
                    value={mapBonus}
                    onChange={(e) => setMapBonus(Math.min(85, Math.max(0, Number(e.target.value))))}
                    className="input-field text-xs py-0.5 w-14 bg-white text-center"
                  />
                  <span className="text-slate-500">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (8 cols): Auto Multi-Stage Milestone Dashboard */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
            {multiReport && focusedStage && focusedProd ? (
              <>
                {/* Summary Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="card p-4 text-center bg-gradient-to-b from-amber-50/60 to-white border-amber-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      全阶段平均 PR 百分位 (Lv.10-70)
                    </div>
                    <div className={`text-4xl font-black mt-1 ${prColor(standardAveragePercentile)}`}>
                      PR {standardAveragePercentile}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      评估指标：{metricLabel(multiReport.evaluatedMetric)}
                    </div>
                  </div>

                  <div className="card p-4 text-center bg-gradient-to-b from-blue-50/60 to-white border-blue-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      巅峰强势阶段 (Lv.{standardPeakStage?.level ?? multiReport.peakStage.level})
                    </div>
                    <div className="text-4xl font-black text-blue-600 mt-1">
                      PR {standardPeakStage?.rating.percentile ?? multiReport.peakStage.rating.percentile}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      {standardPeakStage?.unlockNote ?? multiReport.peakStage.unlockNote}
                    </div>
                  </div>

                  <div className="card p-4 text-center bg-gradient-to-b from-emerald-50/60 to-white border-emerald-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      Lv.{focusedStage.level} {focusedStage.level === 80 ? '前瞻' : ''}相对白板增益
                    </div>
                    <div className="text-4xl font-black text-emerald-600 mt-1">
                      {focusedStage.rating.relativeGain >= 0 ? '+' : ''}
                      {focusedStage.rating.relativeGain}%
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      区间位置 {focusedStage.rating.percentagePosition}% | SP {focusedProd.rp.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* All Progression Stages Matrix (Lv.10, 25, 30, 50, 60, 70, +Lv.80 preview) */}
                <div className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="text-xs font-bold text-slate-800 flex items-center">
                      <Award className="w-4 h-4 mr-1.5 text-blue-600" />
                      全等级阶段自动评分表（点击任意等级切换下方专项详情）
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-2xs text-slate-500 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full">
                        当前查看：Lv.{focusedLevel}{focusedLevel === 80 ? ' (前瞻)' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4 md:grid-cols-7">
                    {multiReport.milestones.map((m) => {
                      const isSelected = m.level === focusedLevel;
                      const isLv80 = m.level === 80;
                      const prod = m.rating.currentProduction;
                      return (
                        <button
                          type="button"
                          key={m.level}
                          onClick={() => setFocusedLevel(m.level)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-400/50 shadow-xs'
                              : isLv80
                                ? 'bg-slate-50/50 border-dashed border-slate-300 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 hover:border-slate-400'
                                : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-extrabold ${
                                  isLv80 && !isSelected ? 'text-slate-500' : 'text-slate-800'
                                }`}
                              >
                                Lv.{m.level}
                              </span>
                              {isLv80 ? (
                                <span
                                  className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                                    isSelected
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-200/80 text-slate-500'
                                  }`}
                                >
                                  前瞻
                                </span>
                              ) : (
                                <span
                                  className={`text-2xs font-black px-1.5 py-0.5 rounded ${gradeBadgeStyle(
                                    m.rating.grade
                                  )}`}
                                >
                                  {m.rating.grade}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {isLv80 ? (isSelected ? '第5副技能推演' : '点击切换前瞻') : m.unlockNote}
                            </div>
                          </div>

                          <div className="mt-2.5">
                            <div
                              className={`text-xl font-black ${
                                isLv80 && !isSelected ? 'text-slate-500' : prColor(m.rating.percentile)
                              }`}
                            >
                              PR {m.rating.percentile}
                            </div>
                            {/* Visual PR Progress Bar */}
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${
                                  isLv80 && !isSelected
                                    ? 'bg-slate-400'
                                    : m.rating.percentile >= 85
                                      ? 'bg-amber-500'
                                      : m.rating.percentile >= 70
                                        ? 'bg-blue-500'
                                        : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(4, m.rating.percentile)}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-slate-200/70 text-[11px] text-slate-600 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-slate-400">总能量</span>
                              <span className="font-bold text-slate-800">
                                {Math.round(prod.totalDailyEnergy).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">
                                {species.specialty === 'skill'
                                  ? '技能/天'
                                  : species.specialty === 'ingredient'
                                    ? '食材/天'
                                    : '树果能量'}
                              </span>
                              <span className="font-semibold text-blue-700">
                                {species.specialty === 'skill'
                                  ? `${prod.dailySkillProcs.toFixed(2)}次`
                                  : species.specialty === 'ingredient'
                                    ? `${prod.dailyIngredientCount.toFixed(1)}个`
                                    : Math.round(prod.dailyBerryEnergy).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-purple-700 pt-0.5 border-t border-slate-100">
                              <span className="text-slate-400">满包/过夜</span>
                              <span className="font-semibold">
                                {prod.hoursToFullCarry.toFixed(1)}h | {(prod.overnightAnalysis.efficiencyRatio * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {focusedLevel === 80 && (
                    <div className="mt-3 px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span>
                          当前正在查看 <strong>Lv.80 前瞻推演</strong>
                          {subskills.level80
                            ? `（已推演第 5 副技能「${
                                getEntityName(
                                  GAME_DATA.subskills.find(
                                    (s) => s.name.toLowerCase() === subskills.level80.toLowerCase()
                                  ),
                                  locale
                                ) || subskills.level80
                              }」与极限生产力）`
                            : '（游戏中 80 级尚未实装；可在左侧副技能栏填入第 5 副技能推演极限表现）'}
                          。
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFocusedLevel(70)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-3 shrink-0 cursor-pointer hover:underline"
                      >
                        返回 Lv.70
                      </button>
                    </div>
                  )}
                </div>

                {/* Best & Worst Combinations at Focused Stage */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="card p-3.5 border-l-4 border-l-emerald-500">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-bold text-xs">
                        <Trophy className="w-4 h-4" />
                        <span>Lv.{focusedStage.level} 理论最佳配置</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">
                        {focusedStage.rating.bestScore.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格:{' '}
                      <strong>
                        {getEntityName(
                          GAME_DATA.natures.find(
                            (n) => n.name === focusedStage.rating.bestCombination.natureName
                          ),
                          locale
                        )}
                      </strong>{' '}
                      | 食材槽: <strong>{focusedStage.rating.bestCombination.ingredientCombo}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {focusedStage.rating.bestCombination.subskillNames.map((s, i) => {
                        const subObj = GAME_DATA.subskills.find((x) => x.name === s);
                        return (
                          <span key={i} className={`badge badge-${subObj?.rarity || 'gold'} text-2xs`}>
                            {subObj ? getEntityName(subObj, locale) : s}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="card p-3.5 border-l-4 border-l-rose-400">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-rose-700 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Lv.{focusedStage.level} 理论最差配置</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600">
                        {focusedStage.rating.worstScore.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格:{' '}
                      <strong>
                        {getEntityName(
                          GAME_DATA.natures.find(
                            (n) => n.name === focusedStage.rating.worstCombination.natureName
                          ),
                          locale
                        )}
                      </strong>{' '}
                      | 食材槽: <strong>{focusedStage.rating.worstCombination.ingredientCombo}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {focusedStage.rating.worstCombination.subskillNames.map((s, i) => {
                        const subObj = GAME_DATA.subskills.find((x) => x.name === s);
                        return (
                          <span key={i} className="badge badge-white text-2xs">
                            {subObj ? getEntityName(subObj, locale) : s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">正在计算各等级阶段评估结果...</div>
            )}
          </div>
        </div>
      </div>

      {/* Mew's Exclusive Versatile Eureka Seed Matrix */}
      {species.name === 'MEW' && mewSkillComparison.length > 0 && (
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-blue-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>梦幻「十项全能」（Versatile）灵感之种全技能流派推演对比</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                通过灵感之种自由切换 12 大主流技能（每次发动必得队伍糖果 + 执行该技能）。针对当前个体配置（Lv.{focusedLevel}）量化对比各流派表现：
              </p>
            </div>
            <span className="text-2xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 font-semibold self-start sm:self-auto">
              当前激活：{MEW_LEARNED_SKILLS.find((s) => s.id === mewLearnedSkill)?.nameZh || mewLearnedSkill}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {mewSkillComparison.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                  item.isCurrent
                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-300/50 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200 hover:border-blue-300 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-slate-800">
                      {locale === 'en' ? item.name : item.nameZh}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {item.role.split(' / ')[0]}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {item.keyOutputText}
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200/60 space-y-1 text-[11px]">
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">附赠糖果</span>
                    <span className="font-bold text-amber-700">+{item.dailyCandies.toFixed(1)} 颗/天</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">日均触发</span>
                    <span className="font-semibold text-slate-700">{item.dailyProcs.toFixed(2)} 次/天</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">技能等效能量</span>
                    <span className="font-bold text-blue-700">
                      +{Math.round(item.skillEnergy).toLocaleString()}
                    </span>
                  </div>

                  <div className="pt-1.5">
                    {item.isCurrent ? (
                      <span className="block text-center text-2xs font-bold text-blue-700 bg-blue-100/80 py-1 rounded-lg">
                        ✓ 当前流派已选定
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMewLearnedSkill(item.id)}
                        className="w-full text-center text-2xs font-bold text-blue-600 hover:text-white hover:bg-blue-600 py-1 rounded-lg border border-blue-300 transition-colors cursor-pointer"
                      >
                        应用此流派 →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Specialty-Specific Deep-Dive Analysis Section */}
      {multiReport && focusedProd && (
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs space-y-5">
          {/* Specialty Deep-Dive Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <span>专项深度分析 (Lv.{focusedLevel} 焦点阶段 & 全阶段对比)</span>
                <span className={`badge badge-${species.specialty} text-2xs`}>
                  本宠专长：{species.specialty === 'berry' ? '树果型' : species.specialty === 'ingredient' ? '食材型' : species.specialty === 'skill' ? '技能型' : '全能型'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                自动展示对应专长的核心指标（树果总能量 / 食材效率与食谱覆盖率 / 技能触发次数与量化效果），也可切换查看副产出表现
              </p>
            </div>

            <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar flex-nowrap">
              <button
                type="button"
                onClick={() => setActiveDeepTab('berry')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeDeepTab === 'berry'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                <span>树果与总能量分析</span>
                {species.specialty === 'berry' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeepTab('ingredient')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeDeepTab === 'ingredient'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>食材效率与食谱覆盖</span>
                {species.specialty === 'ingredient' ? (
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                ) : (focusedProd?.skillDailyIngredientCount ?? 0) > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                    含技能产食材
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeepTab('skill')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeDeepTab === 'skill'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>技能触发与效果分析</span>
                {(species.specialty === 'skill' || species.specialty === 'all') && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeepTab('overnight')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeDeepTab === 'overnight'
                    ? 'bg-white text-purple-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>满包与过夜实战</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                  {focusedProd.hoursToFullCarry.toFixed(1)}h满包
                </span>
              </button>
            </div>
          </div>

          {/* ================= 1. SKILL SPECIALTY PANEL ================= */}
          {activeDeepTab === 'skill' && (
            <div className="space-y-5">
              {/* Cooking Strength Scenario & Recipe Level Selector */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800">料理做饭强度场景配置（精准折算扩锅与暴击）：</span>
                    <span className="text-slate-500 ml-1 hidden sm:inline">
                      {activeCookingContext.scenarioName}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedScenarioId}
                    onChange={(e) => setSelectedScenarioId(e.target.value)}
                    className="input-field text-xs py-1 px-2.5 bg-white font-medium"
                  >
                    {COOKING_SCENARIOS.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name}
                      </option>
                    ))}
                    <option value="custom">自定义单餐能量与填充单价...</option>
                  </select>

                  {selectedScenarioId === 'custom' && (
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <span className="text-2xs text-slate-500">单餐能量:</span>
                        <input
                          type="number"
                          step={5000}
                          value={customDishEnergy}
                          onChange={(e) => setCustomDishEnergy(Math.max(1000, Number(e.target.value)))}
                          className="input-field text-xs py-0.5 w-20 bg-white"
                        />
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-2xs text-slate-500">填充格单价:</span>
                        <input
                          type="number"
                          step={10}
                          value={customFillerEnergy}
                          onChange={(e) => setCustomFillerEnergy(Math.max(50, Number(e.target.value)))}
                          className="input-field text-xs py-0.5 w-16 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Skill Header & Trigger Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-start space-x-3">
                  <img
                    src={getSkillImageUrl(species.skill.image)}
                    alt=""
                    className="w-10 h-10 object-contain bg-white p-1.5 rounded-lg border border-indigo-100 shrink-0"
                  />
                  <div>
                    <div className="text-2xs font-semibold text-indigo-600">主技能与有效等级</div>
                    <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                      {species.skill.translations?.[locale] || species.skill.name}
                    </div>
                    <div className="text-xs font-bold text-indigo-700 mt-1">
                      有效 Lv.{focusedProd.effectiveMainSkillLevel} / {maxSkillLvl}
                      {focusedProd.skillLevelUpBonus > 0 && (
                        <span className="ml-1 text-2xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          副技能+{focusedProd.skillLevelUpBonus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">技能触发几率 (含保底)</div>
                  <div className="text-2xl font-black text-indigo-600 mt-1">
                    {(focusedProd.skillRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    基础 {(focusedProd.baseSkillRate * 100).toFixed(2)}% → 修正{' '}
                    {(focusedProd.skillRateWithoutPity * 100).toFixed(2)}% (保底 {species.pityProcThreshold} 次)
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    Lv.{focusedLevel} 每日期望触发次数
                  </div>
                  <div className="text-2xl font-black text-blue-600 mt-1">
                    {focusedProd.dailySkillProcs.toFixed(2)}{' '}
                    <span className="text-xs font-semibold text-slate-500">次 / 天</span>
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    日均帮忙 {focusedProd.dailyHelps.toFixed(1)} 次 (间隔 {focusedProd.helpingFrequency}s)
                  </div>
                </div>

                {(() => {
                  const det = focusedProd.skillActivationDetails;
                  if (det.activations.length > 1) {
                    return (
                      <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                        <div className="text-2xs font-bold text-emerald-800">
                          复合技能双轨产出 (Lv.{focusedProd.effectiveMainSkillLevel})
                        </div>
                        <div className="mt-1 space-y-1">
                          {det.activations.map((act, i) => {
                            const m = SKILL_UNIT_LABELS[act.unit] || { label: '', unitSuffix: '' };
                            return (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">
                                  {act.unit === 'ingredients'
                                    ? '食材日产'
                                    : act.unit === 'crit chance'
                                      ? '大成功暴率'
                                      : m.label}
                                  :
                                </span>
                                <span className="font-extrabold text-emerald-700">
                                  {act.unit === 'crit chance' ? '+' : ''}
                                  {act.dailySelf.toFixed(1)} {m.unitSuffix}/天
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-2xs text-emerald-800 mt-2 pt-1.5 border-t border-emerald-200/80 flex items-center justify-between">
                          <span>
                            单次:{' '}
                            {det.activations
                              .map(
                                (a) =>
                                  `${a.unit === 'crit chance' ? '+' : ''}${a.perProcSelf}${SKILL_UNIT_LABELS[a.unit]?.unitSuffix || ''}`
                              )
                              .join(' + ')}
                          </span>
                          <span className="font-extrabold text-emerald-700">
                            折算 {Math.round(focusedProd.dailySkillEnergy).toLocaleString()} 能量/天
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const unitMeta =
                    SKILL_UNIT_LABELS[det.primaryUnit] || {
                      label: '技能每日总效果',
                      unitSuffix: '',
                    };
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                      <div className="text-2xs font-semibold text-emerald-700">
                        {unitMeta.label} (Lv.{focusedProd.effectiveMainSkillLevel})
                      </div>
                      <div className="text-2xl font-black text-emerald-700 mt-1">
                        {det.primaryUnit === 'crit chance' ? '+' : ''}
                        {det.dailyOutput.toFixed(1)}{' '}
                        <span className="text-xs font-semibold">{unitMeta.unitSuffix}/天</span>
                      </div>
                      <div className="text-2xs text-emerald-800 mt-1">
                        单次触发: {det.primaryUnit === 'crit chance' ? '+' : ''}{det.perProcOutput} {unitMeta.unitSuffix} | 折算{' '}
                        {Math.round(focusedProd.dailySkillEnergy).toLocaleString()} 能量/天
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Skill Ingredient acquisition callout if skill produces ingredients */}
              {(focusedProd.skillDailyIngredientCount ?? 0) > 0 && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 text-amber-900">
                    <Utensils className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      主技能【<strong>{species.skill.translations?.[locale] || species.skill.name}</strong>】预计每日获取约{' '}
                      <strong>{focusedProd.skillDailyIngredientCount.toFixed(1)} 个食材</strong>
                      {species.name === 'SANDSHREW' || species.name === 'SANDSLASH'
                        ? '（从南瓜 / 玉米 / 土豆专属池抽选）'
                        : '（从全品类食材中随机获取）'}
                      {focusedProd.skillActivationDetails.activations.some((a) => a.unit === 'crit chance')
                        ? `，并叠加每日约 +${(focusedProd.skillActivationDetails.activations.find((a) => a.unit === 'crit chance')?.dailySelf ?? 0).toFixed(1)}% 料理大成功率！`
                        : '，已全量计入食谱覆盖率分析！'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDeepTab('ingredient')}
                    className="px-2.5 py-1 text-2xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    查看食谱自给率 →
                  </button>
                </div>
              )}

              {/* Cooking Power-Up (Pot expansion) Contextual Callout */}
              {focusedProd.skillActivationDetails.primaryUnit === 'pot size' && (
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs flex items-center justify-between gap-2 text-blue-900">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong>料理扩锅机制</strong>：预计每日提供扩容约{' '}
                      <strong>+{focusedProd.skillActivationDetails.dailyOutput.toFixed(1)} 格容量</strong>
                      （单次 +{focusedProd.skillActivationDetails.perProcOutput} 格）。可突破平日 57 格上限烹饪 77/80 格高阶顶级食谱（如炼狱咖喱/早起布丁），每格按边际高阶食材+食谱加成等效折算每日约{' '}
                      <strong>{Math.round(focusedProd.dailySkillEnergy).toLocaleString()} 能量</strong>。
                    </span>
                  </div>
                </div>
              )}

              {/* Tasty Chance (Extra Tasty / Crit chance) Contextual Callout */}
              {focusedProd.skillActivationDetails.primaryUnit === 'crit chance' && (
                <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl text-xs flex items-center justify-between gap-2 text-purple-900">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>
                      <strong>美味机会机制</strong>：预计每日累积增加约{' '}
                      <strong>+{focusedProd.skillActivationDetails.dailyOutput.toFixed(1)}% 料理大成功概率</strong>
                      （未暴击持续累加保底）。平日暴击 ×2、周日暴击 ×3，按队伍高级做饭基线折算每日等价约{' '}
                      <strong>{Math.round(focusedProd.dailySkillEnergy).toLocaleString()} 能量</strong>。
                    </span>
                  </div>
                </div>
              )}

              {/* Multi-Stage Skill Trigger & Effect Progression Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">养成阶段</th>
                      <th className="py-2.5 px-3">有效技能等级</th>
                      <th className="py-2.5 px-3">含保底触发率</th>
                      <th className="py-2.5 px-3">期望触发次数 / 天</th>
                      <th className="py-2.5 px-3">每日量化技能产出</th>
                      <th className="py-2.5 px-3">技能折算能量 / 天</th>
                      <th className="py-2.5 px-3">综合日总能量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multiReport.milestones.map((m) => {
                      const p = m.rating.currentProduction;
                      const det = p.skillActivationDetails;
                      const unitMeta = SKILL_UNIT_LABELS[det.primaryUnit] || {
                        label: '',
                        unitSuffix: '',
                      };
                      return (
                        <tr
                          key={m.level}
                          className={m.level === focusedLevel ? 'bg-indigo-50/40 font-semibold' : ''}
                        >
                          <td className="py-2 px-3 font-bold text-slate-800">
                            Lv.{m.level}{' '}
                            <span className="text-2xs text-slate-400 font-normal">({m.unlockNote})</span>
                          </td>
                          <td className="py-2 px-3">
                            Lv.{p.effectiveMainSkillLevel}
                            {p.skillLevelUpBonus > 0 && (
                              <span className="text-2xs text-amber-700 ml-1">
                                (+{p.skillLevelUpBonus})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">{(p.skillRate * 100).toFixed(2)}%</td>
                          <td className="py-2 px-3 font-bold text-indigo-600">
                            {p.dailySkillProcs.toFixed(2)} 次/天
                          </td>
                          <td className="py-2 px-3 text-emerald-700 font-semibold">
                            {det.activations.length > 1 ? (
                              <div className="space-y-0.5">
                                {det.activations.map((act, i) => {
                                  const am = SKILL_UNIT_LABELS[act.unit] || { unitSuffix: '' };
                                  return (
                                    <div key={i} className="text-2xs whitespace-nowrap">
                                      <span className="font-bold">
                                        {act.unit === 'crit chance' ? '+' : ''}
                                        {act.dailySelf.toFixed(1)}
                                      </span>{' '}
                                      {am.unitSuffix}/天
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                {det.primaryUnit === 'crit chance' ? '+' : ''}
                                {det.dailyOutput.toFixed(1)} {unitMeta.unitSuffix}
                                {det.perProcTeamTotalOutput > 0 && (
                                  <span className="text-2xs text-slate-500 ml-1">
                                    (含队友 {det.dailyTeamTotalOutput.toFixed(1)})
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {Math.round(p.dailySkillEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-bold text-blue-600">
                            {Math.round(p.totalDailyEnergy).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ================= HORIZONTAL BAR CHART: SKILL SPECIALIST BENCHMARK RANKING ================= */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="text-sm font-black text-slate-800 flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4 text-indigo-600" />
                      <span>
                        【{skillRankingResult.categoryDisplayName}】全游技能天梯榜
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {SKILL_CATEGORY_META[skillRankingCategory]?.description || '横向对比全游不同技能定位宠物的期望发动次数与实际效果量化排行'}
                    </p>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                      {[30, 50, 60, 70].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setSkillRankingLevel(lvl)}
                          className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                            skillRankingLevel === lvl
                              ? 'bg-white text-indigo-700 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Lv.{lvl}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSkillRankingOnlyFinalEvolution((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        skillRankingOnlyFinalEvolution
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {skillRankingOnlyFinalEvolution ? '✓ 仅最终形态' : '全部形态'}
                    </button>
                  </div>
                </div>

                {/* Category & Metric pills */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  {/* Category Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        'healer',
                        'pot_expansion',
                        'charge_strength',
                        'ingredient_draw',
                        'cooking_crit',
                        'helper_boost',
                        'all_skill_mon',
                      ] as SkillRankingCategory[]
                    ).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSkillRankingCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          skillRankingCategory === cat
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {SKILL_CATEGORY_META[cat].displayName}
                      </button>
                    ))}
                  </div>

                  {/* Metric Switch */}
                  <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSkillRankingMetric('skill_procs')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer ${
                        skillRankingMetric === 'skill_procs'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      发动次数 (次/天)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkillRankingMetric('skill_value')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer ${
                        skillRankingMetric === 'skill_value'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      实效量化 ({SKILL_CATEGORY_META[skillRankingCategory]?.primaryUnit || '量化'})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkillRankingMetric('total_energy')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer ${
                        skillRankingMetric === 'total_energy'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      全天总能量
                    </button>
                  </div>
                </div>

                {/* Horizontal Bar Chart List */}
                <div className="space-y-2.5">
                  {skillRankingResult.entries.slice(0, 15).map((entry, idx) => {
                    const isTop3 = idx < 3;
                    const rankBadgeColor =
                      idx === 0
                        ? 'bg-amber-500 text-white'
                        : idx === 1
                        ? 'bg-slate-400 text-white'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-200 text-slate-600';

                    return (
                      <div
                        key={`${entry.pokemon.name}_${entry.isCurrentPokemon}_${idx}`}
                        className={`p-3 rounded-xl border transition-all ${
                          entry.isCurrentPokemon
                            ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/70 shadow-xs'
                            : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${rankBadgeColor}`}
                            >
                              {entry.isCurrentPokemon ? '★' : idx + 1}
                            </span>

                            <img
                              src={getPokemonImageUrl(entry.pokemon.name)}
                              alt={entry.pokemon.name}
                              className="w-7 h-7 object-contain shrink-0"
                            />

                            <div className="min-w-0 flex items-center space-x-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">
                                {getEntityName(entry.pokemon, locale)}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  entry.pokemon.specialty === 'skill'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : entry.pokemon.specialty === 'berry'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {entry.pokemon.specialty === 'skill'
                                  ? '技能型'
                                  : entry.pokemon.specialty === 'berry'
                                  ? '树果型'
                                  : '食材型'}
                              </span>
                              {entry.isCurrentPokemon && (
                                <span className="text-[10px] font-black text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                                  👈 当前分析个体 (Lv.{entry.level})
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 hidden sm:inline">
                                {entry.subskillSummary}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2">
                            {skillRankingMetric === 'skill_procs' ? (
                              <div>
                                <span className="text-xs font-black text-indigo-700">
                                  {entry.dailySkillProcs.toFixed(2)}{' '}
                                  <span className="text-[10px] font-normal text-slate-500">次/天</span>
                                </span>
                                {skillRankingCategory !== 'all_skill_mon' && (
                                  <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                                    ({entry.quantifiedLabel}: {entry.quantifiedValue} {entry.quantifiedUnit})
                                  </span>
                                )}
                              </div>
                            ) : skillRankingMetric === 'skill_value' ? (
                              <div>
                                <span className="text-xs font-black text-emerald-700">
                                  {entry.quantifiedValue}{' '}
                                  <span className="text-[10px] font-normal text-slate-500">{entry.quantifiedUnit}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                                  ({entry.dailySkillProcs.toFixed(2)} 次/天)
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-xs font-black text-blue-700">
                                  {Math.round(entry.dailyTotalEnergy).toLocaleString()}{' '}
                                  <span className="text-[10px] font-normal text-slate-500">pts/天</span>
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                                  ({entry.dailySkillProcs.toFixed(2)} 次/天)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Horizontal Bar */}
                        <div className="w-full bg-slate-200/70 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              entry.isCurrentPokemon
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                                : isTop3
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600'
                                : 'bg-gradient-to-r from-slate-400 to-slate-500'
                            }`}
                            style={{ width: `${Math.max(4, entry.relativePercentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= 2. BERRY SPECIALTY PANEL ================= */}
          {activeDeepTab === 'berry' && berryComparison && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center space-x-3">
                  {berryObj && (
                    <img
                      src={getBerryImageUrl(berryObj.name)}
                      alt={berryObj.name}
                      className="w-10 h-10 object-contain bg-white p-1.5 rounded-lg border border-emerald-100 shrink-0"
                    />
                  )}
                  <div>
                    <div className="text-2xs font-semibold text-emerald-700">产果效率与属性</div>
                    <div className="font-extrabold text-sm text-slate-900 mt-0.5 flex items-center space-x-1">
                      <span>{getEntityName(berryObj, locale)}</span>
                      {species.type && (
                        <img
                          src={getTypeImageUrl(species.type)}
                          alt={species.type}
                          className="w-4 h-4 object-contain"
                        />
                      )}
                      <span className="text-xs text-slate-500">
                        ({getPokemonTypeLabel(species.type, locale)})
                      </span>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 mt-1">
                      每次掉落 {focusedProd.berriesPerDrop} 颗 | 日产 {focusedProd.dailyBerryCount.toFixed(1)} 颗
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-2xs font-semibold text-blue-700">
                    适性岛屿 (2×树果) 日总能量
                  </div>
                  <div className="text-2xl font-black text-blue-700 mt-1">
                    {Math.round(berryComparison.favored.totalDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    纯树果: {Math.round(berryComparison.favored.dailyBerryEnergy).toLocaleString()} / 天
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    非适性岛屿 (1×树果) 日总能量
                  </div>
                  <div className="text-2xl font-black text-slate-800 mt-1">
                    {Math.round(berryComparison.unfavored.totalDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    纯树果: {Math.round(berryComparison.unfavored.dailyBerryEnergy).toLocaleString()} / 天
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                  <div className="text-2xs font-semibold text-amber-800">
                    满包纯树果偷吃 (Sneaky Snacking)
                  </div>
                  <div className="text-2xl font-black text-amber-700 mt-1">
                    {Math.round(focusedProd.sneakySnackingDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    容量 {focusedProd.carryLimit} 格 (约 {focusedProd.hoursToFullCarry.toFixed(1)} 小时装满)
                  </div>
                </div>
              </div>

              {/* Multi-Stage Berry & Total Energy Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">养成阶段</th>
                      <th className="py-2.5 px-3">帮忙间隔</th>
                      <th className="py-2.5 px-3">单次树果数</th>
                      <th className="py-2.5 px-3">单颗树果能量</th>
                      <th className="py-2.5 px-3">日树果能量</th>
                      <th className="py-2.5 px-3">满包偷吃日能量</th>
                      <th className="py-2.5 px-3">日综合总能量 (树果+食材+技能)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multiReport.milestones.map((m) => {
                      const p = m.rating.currentProduction;
                      return (
                        <tr
                          key={m.level}
                          className={m.level === focusedLevel ? 'bg-emerald-50/40 font-semibold' : ''}
                        >
                          <td className="py-2 px-3 font-bold text-slate-800">Lv.{m.level}</td>
                          <td className="py-2 px-3">{p.helpingFrequency}s</td>
                          <td className="py-2 px-3">{p.berriesPerDrop} 颗/次</td>
                          <td className="py-2 px-3">{p.berryStrength}</td>
                          <td className="py-2 px-3 text-emerald-700 font-bold">
                            {Math.round(p.dailyBerryEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-amber-700">
                            {Math.round(p.sneakySnackingDailyEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-bold text-blue-600">
                            {Math.round(p.totalDailyEnergy).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ================= HORIZONTAL BAR CHART: BERRY & ISLAND ENERGY BENCHMARK RANKING ================= */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="text-sm font-black text-slate-800 flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4 text-emerald-600" />
                      <span>
                        【{energyRankingResult.scopeDisplayName}】能量产出天梯榜
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      横向对比全游不同宝可梦在{' '}
                      {energyRankingResult.targetIsland
                        ? getEntityName(energyRankingResult.targetIsland, locale)
                        : berryObj
                        ? getEntityName(berryObj, locale)
                        : '对应属性'}{' '}
                      的能量产出实力排行（大竺葵与蜥蜴王等跨专长同台较量）
                    </p>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                      {[30, 50, 60, 70].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setEnergyRankingLevel(lvl)}
                          className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                            energyRankingLevel === lvl
                              ? 'bg-white text-emerald-700 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Lv.{lvl}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setEnergyRankingOnlyFinalEvolution((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        energyRankingOnlyFinalEvolution
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {energyRankingOnlyFinalEvolution ? '✓ 仅最终形态' : '全部形态'}
                    </button>
                  </div>
                </div>

                {/* Scope, Specialty & Metric filters */}
                <div className="space-y-2.5 pt-1">
                  {/* Row 1: Scope & Specialty */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    {/* Scope Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 mr-1">范围:</span>
                      <button
                        type="button"
                        onClick={() => setEnergyRankingScope('same_berry')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center space-x-1 ${
                          energyRankingScope === 'same_berry'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {berryObj && (
                          <img
                            src={getBerryImageUrl(berryObj.name)}
                            alt={berryObj.name}
                            className="w-3.5 h-3.5 object-contain"
                          />
                        )}
                        <span>同树果 ({getEntityName(berryObj, locale)})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEnergyRankingScope('same_island')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          energyRankingScope === 'same_island'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        同岛屿 (
                        {energyRankingResult.targetIsland
                          ? getEntityName(energyRankingResult.targetIsland, locale)
                          : '适性岛'}
                        )
                      </button>

                      <button
                        type="button"
                        onClick={() => setEnergyRankingScope('all_berry_mon')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          energyRankingScope === 'all_berry_mon'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        全游树果霸主榜
                      </button>
                    </div>

                    {/* Metric Switch */}
                    <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setEnergyRankingMetric('berry_energy')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          energyRankingMetric === 'berry_energy'
                            ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        纯树果能量
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnergyRankingMetric('total_energy')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          energyRankingMetric === 'total_energy'
                            ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        全天总能量 (含技能/食材)
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Specialty Filter (Critical for Meganium vs Sceptile flexibility!) */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100 text-xs">
                    <span className="text-[11px] font-bold text-slate-600 mr-1 flex items-center">
                      <SlidersHorizontal className="w-3 h-3 text-slate-500 mr-1" />
                      专长过滤:
                    </span>
                    {(
                      [
                        { id: 'all', label: '全部专长 (跨专长PK：大竺葵 vs 蜥蜴王)' },
                        { id: 'berry', label: '仅树果型' },
                        { id: 'skill', label: '仅技能型' },
                        { id: 'ingredient', label: '仅食材型' },
                      ] as Array<{ id: EnergyRankingSpecialtyFilter; label: string }>
                    ).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setEnergyRankingSpecialtyFilter(sp.id)}
                        className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                          energyRankingSpecialtyFilter === sp.id
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizontal Bar Chart List */}
                <div className="space-y-2.5">
                  {energyRankingResult.entries.slice(0, 15).map((entry, idx) => {
                    const isTop3 = idx < 3;
                    const rankBadgeColor =
                      idx === 0
                        ? 'bg-amber-500 text-white'
                        : idx === 1
                        ? 'bg-slate-400 text-white'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-200 text-slate-600';

                    const entryBerryObj = GAME_DATA.berries.find(
                      (b) => b.name.toUpperCase() === entry.berry.toUpperCase()
                    );

                    return (
                      <div
                        key={`${entry.pokemon.name}_${entry.isCurrentPokemon}_${idx}`}
                        className={`p-3 rounded-xl border transition-all ${
                          entry.isCurrentPokemon
                            ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/70 shadow-xs'
                            : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${rankBadgeColor}`}
                            >
                              {entry.isCurrentPokemon ? '★' : idx + 1}
                            </span>

                            <img
                              src={getPokemonImageUrl(entry.pokemon.name)}
                              alt={entry.pokemon.name}
                              className="w-7 h-7 object-contain shrink-0"
                            />

                            <div className="min-w-0 flex items-center space-x-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">
                                {getEntityName(entry.pokemon, locale)}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  entry.specialty === 'skill'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : entry.specialty === 'berry'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {entry.specialty === 'skill'
                                  ? '技能型'
                                  : entry.specialty === 'berry'
                                  ? '树果型'
                                  : '食材型'}
                              </span>
                              {entryBerryObj && (
                                <span className="inline-flex items-center space-x-1 text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                  <img
                                    src={getBerryImageUrl(entryBerryObj.name)}
                                    alt={entryBerryObj.name}
                                    className="w-3.5 h-3.5 object-contain"
                                  />
                                  <span>{getEntityName(entryBerryObj, locale)}</span>
                                </span>
                              )}
                              {entry.isCurrentPokemon && (
                                <span className="text-[10px] font-black text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                                  👈 当前分析个体 (Lv.{entry.level})
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 hidden sm:inline">
                                {entry.subskillSummary}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2">
                            {energyRankingMetric === 'berry_energy' ? (
                              <div>
                                <span className="text-xs font-black text-emerald-700">
                                  {Math.round(entry.dailyBerryEnergy).toLocaleString()}{' '}
                                  <span className="text-[10px] font-normal text-slate-500">pts/天</span>
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                                  (总: {Math.round(entry.dailyTotalEnergy).toLocaleString()})
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-xs font-black text-blue-700">
                                  {Math.round(entry.dailyTotalEnergy).toLocaleString()}{' '}
                                  <span className="text-[10px] font-normal text-slate-500">pts/天</span>
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                                  (树果: {Math.round(entry.dailyBerryEnergy).toLocaleString()})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Horizontal Bar */}
                        <div className="w-full bg-slate-200/70 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              entry.isCurrentPokemon
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                                : isTop3
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                                : 'bg-gradient-to-r from-slate-400 to-slate-500'
                            }`}
                            style={{ width: `${Math.max(4, entry.relativePercentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= 3. INGREDIENT SPECIALTY & RECIPE COVERAGE PANEL ================= */}
          {activeDeepTab === 'ingredient' && focusedRecipeCoverage && (
            <div className="space-y-6">
              {/* Ingredient Acquisition Efficiency KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="text-2xs font-semibold text-amber-800">
                    Lv.{focusedLevel} 食材发现率
                  </div>
                  <div className="text-2xl font-black text-amber-700 mt-1">
                    {(focusedProd.ingredientRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    基础 {species.ingredientPercentage}% | 满包耗时 {focusedProd.hoursToFullCarry.toFixed(1)}h
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    Lv.{focusedLevel} 每日总食材产出
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {focusedRecipeCoverage.totalCombinedDailyCount.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">个 / 天</span>
                  </div>
                  <div className="text-2xs mt-1">
                    {focusedRecipeCoverage.hasSkillIngredients ? (
                      <span className="text-amber-800 font-medium">
                        掉落 {focusedRecipeCoverage.totalDirectDailyCount.toFixed(1)} + 技能 {focusedRecipeCoverage.totalSkillDailyCount.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        直塞基础能量: {Math.round(focusedProd.dailyIngredientEnergy).toLocaleString()} / 天
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <div className="text-2xs font-semibold text-emerald-800">
                    三餐对应食材槽自给达标食谱
                  </div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">
                    {focusedRecipeCoverage.threeMealPartnerReadyCount}{' '}
                    <span className="text-xs font-normal text-emerald-700">
                      / {focusedRecipeCoverage.relevantRecipesTotal} 道关联菜肴
                    </span>
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    本宠所产食材日产量 ≥ 该食谱一日三餐总需求
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-2xs font-semibold text-blue-800">单宠完全独揽食谱数</div>
                  <div className="text-2xl font-black text-blue-700 mt-1">
                    {focusedRecipeCoverage.soloCookable1MealCount} 道{' '}
                    <span className="text-xs font-normal text-slate-500">
                      (三餐独揽 {focusedRecipeCoverage.soloCookable3MealsCount} 道)
                    </span>
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    无需队友补充其他食材即可独立成菜
                  </div>
                </div>
              </div>

              {/* Skill Ingredient acquisition callout */}
              {focusedRecipeCoverage.hasSkillIngredients && (
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      已计入主技能<strong>【{species.skill.translations?.[locale] || species.skill.name}】</strong>
                      每日预计获取的 <strong>{focusedRecipeCoverage.totalSkillDailyCount.toFixed(1)} 个食材</strong>
                      {species.name === 'SANDSHREW' || species.name === 'SANDSLASH'
                        ? '（从本宠自属的南瓜 / 玉米 / 土豆专属池中抽选）'
                        : '（从全品类食材中随机获取）'}
                      ，有效提升食谱自给率与一日三餐覆盖率！
                    </span>
                  </div>
                </div>
              )}

              {/* ================= GRANULAR TARGET INGREDIENT SELECTOR & DEEP-DIVE ================= */}
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/40 border border-amber-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-amber-950 flex items-center space-x-1.5">
                      <Utensils className="w-4 h-4 text-amber-600" />
                      <span>目标食材深度细化产量分析与天梯</span>
                    </div>
                    <p className="text-2xs text-amber-800/80 mt-0.5">
                      选择特定食材，查看本宠在该食材上的专精产量、解锁演进及在全游食材宠中的实力位次
                    </p>
                  </div>

                  {/* Dropdown for any ingredient */}
                  <div className="flex items-center space-x-2">
                    <span className="text-2xs text-slate-500 font-semibold shrink-0">自由探索食材:</span>
                    <select
                      value={effectiveTargetIngredient}
                      onChange={(e) => setSelectedTargetIngredient(e.target.value)}
                      className="input-field text-xs py-1 bg-white border-amber-300 font-semibold text-slate-800"
                    >
                      {GAME_DATA.ingredients.map((ing) => (
                        <option key={ing.name} value={ing.name}>
                          {getEntityName(ing, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Selection Pills from species pools */}
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
                  <span className="text-2xs font-bold text-slate-500 shrink-0">本宠涉及食材:</span>
                  {availableIngredientsForSpecies.map((ingName) => {
                    const ingObj = GAME_DATA.ingredients.find(
                      (i) => i.name.toLowerCase() === ingName.toLowerCase()
                    );
                    const isSelected =
                      effectiveTargetIngredient.toLowerCase() === ingName.toLowerCase();
                    return (
                      <button
                        key={ingName}
                        type="button"
                        onClick={() => setSelectedTargetIngredient(ingName)}
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-amber-600 text-white shadow-xs scale-102'
                            : 'bg-white text-slate-700 border border-amber-200 hover:border-amber-400 hover:bg-amber-50'
                        }`}
                      >
                        <img
                          src={getIngredientImageUrl(ingName)}
                          alt={ingName}
                          className="w-4 h-4 object-contain"
                        />
                        <span>{ingObj ? getEntityName(ingObj, locale) : ingName}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Target Ingredient Detailed Yield KPI Cards */}
                {currentSpecificYield && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Lv.{focusedLevel} 【{targetIngObj ? getEntityName(targetIngObj, locale) : effectiveTargetIngredient}】日产量
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-amber-800 mt-1 flex items-baseline space-x-1">
                        <span>{currentSpecificYield.dailyYield.toFixed(1)}</span>
                        <span className="text-xs font-normal text-slate-500">份 / 天</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500">食材产出占比</div>
                      <div className="text-xl sm:text-2xl font-black text-amber-700 mt-1 flex items-baseline space-x-1">
                        <span>{currentSpecificYield.ratio.toFixed(1)}%</span>
                        <span className="text-[10px] font-normal text-slate-400">总食材</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500">单次帮忙期望</div>
                      <div className="text-xl sm:text-2xl font-black text-slate-800 mt-1 flex items-baseline space-x-1">
                        <span>{(currentSpecificYield.dailyYield / (focusedProd?.dailyHelps || 1)).toFixed(2)}</span>
                        <span className="text-[10px] font-normal text-slate-500">份 / 次</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500">食材基础能量折算</div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 flex items-baseline space-x-1">
                        <span>+{Math.round((targetIngObj?.value || 100) * currentSpecificYield.dailyYield).toLocaleString()}</span>
                        <span className="text-[10px] font-normal text-slate-400">能量/天</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Ingredient Milestone Yield Trajectory */}
                <div>
                  <div className="text-2xs font-bold text-slate-600 mb-1.5 flex items-center justify-between">
                    <span>各成长里程碑【{targetIngObj ? getEntityName(targetIngObj, locale) : effectiveTargetIngredient}】产量阶梯演进：</span>
                    <span className="text-slate-400 font-normal">点击任意里程碑可快速切换</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {multiReport.milestones.map((m) => {
                      const mProd = m.rating.currentProduction;
                      const mYield = getSpecificIngredientYield(mProd, effectiveTargetIngredient);
                      const isCurrentFocused = m.level === focusedLevel;
                      return (
                        <div
                          key={m.level}
                          onClick={() => setFocusedLevel(m.level)}
                          className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isCurrentFocused
                              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300 shadow-2xs'
                              : 'bg-white border-amber-200/60 hover:bg-amber-50'
                          }`}
                        >
                          <div className="text-2xs font-bold text-slate-500 mb-0.5">
                            {m.level === 80 ? 'Lv.80 (前瞻)' : `Lv.${m.level}`}
                          </div>
                          <div className="text-sm font-black text-amber-900">
                            {mYield.dailyYield.toFixed(1)}{' '}
                            <span className="text-[9px] font-normal text-slate-500">份</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            占 {mYield.ratio.toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recipe Sustainability Callout */}
                {targetRecipesSupport.length > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-amber-200/70">
                    <div className="text-2xs font-bold text-slate-600 mb-2">
                      当前【{targetIngObj ? getEntityName(targetIngObj, locale) : effectiveTargetIngredient}】日均产出可独立供给核心食谱次数：
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {targetRecipesSupport.map(({ recipe, reqPerMeal, mealsPerDay }) => (
                        <div
                          key={recipe.name}
                          className="p-2 rounded-lg bg-amber-50/50 border border-amber-100 flex items-center space-x-2 text-xs"
                        >
                          <img
                            src={getRecipeImageUrl(recipe.name)}
                            alt={recipe.name}
                            className="w-7 h-7 object-contain shrink-0 rounded"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">
                              {getEntityName(recipe, locale)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              每餐需 {reqPerMeal} ·{' '}
                              <strong className={mealsPerDay >= 3 ? 'text-emerald-700' : 'text-amber-700'}>
                                可做 {mealsPerDay.toFixed(1)} 次/天
                              </strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ================= HORIZONTAL BAR CHART: TARGET INGREDIENT BENCHMARK RANKING ================= */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="text-sm font-black text-slate-800 flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4 text-amber-600" />
                      <span>
                        【{targetIngObj ? getEntityName(targetIngObj, locale) : effectiveTargetIngredient}】食材宠全游产出天梯榜
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      量化对比全游不同食材宠、不同食材槽搭配（AAA/ABB 等）与进化阶段在 Lv.{rankingLevel} 的产出实力排行
                    </p>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                      {[30, 50, 60, 70].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setRankingLevel(lvl)}
                          className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                            rankingLevel === lvl
                              ? 'bg-white text-amber-700 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Lv.{lvl}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRankingOnlyFinalEvolution((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        rankingOnlyFinalEvolution
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {rankingOnlyFinalEvolution ? '✓ 仅最终形态' : '全部形态'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRankingOnlyAAA((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        rankingOnlyAAA
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {rankingOnlyAAA ? '✓ 仅纯产(AAA)' : '全部组合'}
                    </button>
                  </div>
                </div>

                {/* Horizontal Bar Chart List */}
                <div className="space-y-2.5">
                  {ingredientRankingResult?.entries.slice(0, 15).map((entry, idx) => {
                    const isTop3 = idx < 3;
                    const rankBadgeColor =
                      idx === 0
                        ? 'bg-amber-500 text-white'
                        : idx === 1
                        ? 'bg-slate-400 text-white'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-200 text-slate-600';

                    return (
                      <div
                        key={`${entry.pokemon.name}_${entry.comboCode}_${entry.isCurrentPokemon}_${idx}`}
                        className={`p-3 rounded-xl border transition-all ${
                          entry.isCurrentPokemon
                            ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/70 shadow-xs'
                            : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${rankBadgeColor}`}
                            >
                              {entry.isCurrentPokemon ? '★' : idx + 1}
                            </span>

                            <img
                              src={getPokemonImageUrl(entry.pokemon.name)}
                              alt={entry.pokemon.name}
                              className="w-7 h-7 object-contain shrink-0"
                            />

                            <div className="min-w-0 flex items-center space-x-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">
                                {getEntityName(entry.pokemon, locale)}
                              </span>
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                                {entry.comboCode}
                              </span>
                              {entry.isCurrentPokemon && (
                                <span className="text-[10px] font-black text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                                  👈 当前分析个体 (Lv.{entry.level})
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 hidden sm:inline">
                                {entry.subskillSummary}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2">
                            <span className="text-xs font-black text-slate-900">
                              {entry.dailyTargetYield.toFixed(1)}{' '}
                              <span className="text-[10px] font-normal text-slate-500">份/天</span>
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1.5 hidden xs:inline">
                              ({entry.targetRatio.toFixed(0)}% 纯度)
                            </span>
                          </div>
                        </div>

                        {/* Horizontal Bar */}
                        <div className="w-full bg-slate-200/70 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              entry.isCurrentPokemon
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                                : isTop3
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600'
                                : 'bg-gradient-to-r from-slate-400 to-slate-500'
                            }`}
                            style={{ width: `${Math.max(4, entry.relativePercentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Stage Ingredient Daily Yield Breakdown */}
              <div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  各解锁阶段日均食材产出明细 (Lv.10 → Lv.30 → Lv.50 → Lv.60 → Lv.70)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {multiReport.milestones
                    .filter((m) => [10, 30, 50, 60, 70].includes(m.level))
                    .map((m) => {
                      const p = m.rating.currentProduction;
                      return (
                        <div
                          key={m.level}
                          onClick={() => setFocusedLevel(m.level)}
                          className={`p-3 rounded-xl border cursor-pointer ${
                            m.level === focusedLevel
                              ? 'bg-amber-50/60 border-amber-400'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                            <span>Lv.{m.level}</span>
                            <span className="text-2xs text-amber-700">
                              共 {(p.combinedDailyIngredientCount ?? p.dailyIngredientCount).toFixed(1)}/天
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {(p.combinedDailyIngredients || p.dailyIngredients).map((ing) => {
                              const ingObj = GAME_DATA.ingredients.find(
                                (i) => i.name.toLowerCase() === ing.ingredient.toLowerCase()
                              );
                              const skillItem = p.skillDailyIngredients?.find(
                                (s) => s.ingredient.toLowerCase() === ing.ingredient.toLowerCase()
                              );
                              return (
                                <div
                                  key={ing.ingredient}
                                  className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-slate-100"
                                >
                                  <span className="inline-flex items-center space-x-1.5 truncate">
                                    <img
                                      src={getIngredientImageUrl(ing.ingredient)}
                                      alt={ing.ingredient}
                                      className="w-4 h-4 object-contain shrink-0"
                                    />
                                    <span className="truncate">
                                      {ingObj ? getEntityName(ingObj, locale) : ing.ingredient}
                                    </span>
                                  </span>
                                  <span className="font-bold text-amber-800 ml-1 inline-flex items-center space-x-1">
                                    <span>{ing.amount.toFixed(1)}</span>
                                    {skillItem && skillItem.amount > 0 && (
                                      <span className="text-[9px] font-normal text-indigo-600 bg-indigo-50 px-1 rounded">
                                        技能
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Recipe Coverage & 3-Meals Compatibility Matrix */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Lv.{focusedLevel} 核心适配食谱与一日三餐覆盖率分析</span>
                  </div>

                  <div className="flex space-x-1.5 overflow-x-auto no-scrollbar flex-nowrap">
                    {(
                      [
                        { id: 'curry' as const, label: getUIText('curry', locale) },
                        { id: 'salad' as const, label: getUIText('salad', locale) },
                        { id: 'dessert' as const, label: getUIText('dessert', locale) },
                      ]
                    ).map((tab) => {
                      const stat = focusedRecipeCoverage.byType[tab.id];
                      return (
                        <button
                          type="button"
                          key={tab.id}
                          onClick={() => setRecipeDishTab(tab.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
                            recipeDishTab === tab.id
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {tab.label} ({stat.threeMealReadyCount}/{stat.relevantCount})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {focusedRecipeCoverage.byType[recipeDishTab].topDishes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    本宝可梦在 Lv.{focusedLevel} 产出的食材暂不匹配该类别食谱。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {focusedRecipeCoverage.byType[recipeDishTab].topDishes.map((match) => {
                      const r = match.recipe;
                      return (
                        <div
                          key={r.name}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                            match.threeMealSelfSufficientForMatched
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div>
                            {/* Recipe Sprite + Title */}
                            <div className="flex items-start space-x-2.5">
                              <img
                                src={getRecipeImageUrl(r.name)}
                                alt={r.displayName}
                                loading="lazy"
                                className="w-11 h-11 object-contain bg-slate-50 rounded-lg p-1 border border-slate-100 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-slate-900 truncate">
                                  {getEntityName(r, locale)}
                                </div>
                                <div className="text-2xs text-slate-500 mt-0.5">
                                  基础能量 {r.value.toLocaleString()} | 共 {r.nrOfIngredients} 食材
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {match.isSoloCookable3Meals ? (
                                    <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                      单宠三餐全包
                                    </span>
                                  ) : match.threeMealSelfSufficientForMatched ? (
                                    <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      本宠负责槽位三餐达标 ({match.mealsPerDayForMatched}餐/天)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                      可支撑 {match.mealsPerDayForMatched} 餐/天 (三餐覆盖 {match.totalMatchedDailyRatio}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* All Recipe Ingredients (highlighting matched vs partner slots) */}
                            <div className="mt-3 space-y-1.5">
                              {r.ingredients.map((req) => {
                                const mItem = match.matchedIngredients.find(
                                  (mi) => mi.ingredient.toLowerCase() === req.ingredient.toLowerCase()
                                );
                                const ingObj = GAME_DATA.ingredients.find(
                                  (i) => i.name.toLowerCase() === req.ingredient.toLowerCase()
                                );
                                return (
                                  <div key={req.ingredient} className="text-2xs">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center space-x-1">
                                        <img
                                          src={getIngredientImageUrl(req.ingredient)}
                                          alt={req.ingredient}
                                          className="w-3.5 h-3.5 object-contain"
                                        />
                                        <span className={mItem ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                                          {ingObj ? getEntityName(ingObj, locale) : req.ingredient} ×{req.amount}/餐
                                        </span>
                                      </span>
                                      {mItem ? (
                                        <span
                                          className={`font-bold ${
                                            mItem.threeMealCoveragePct >= 100
                                              ? 'text-emerald-700'
                                              : 'text-amber-700'
                                          }`}
                                        >
                                          日产 {mItem.dailyProduced}
                                          {mItem.skillProduced > 0 && (
                                            <span className="text-[10px] font-normal text-indigo-600 ml-0.5">
                                              (含技能 {mItem.skillProduced})
                                            </span>
                                          )}{' '}
                                          / 三餐需 {mItem.threeMealRequired}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">需队友搭配 (三餐 {req.amount * 3})</span>
                                      )}
                                    </div>
                                    {mItem && (
                                      <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                                        <div
                                          className={`h-full rounded-full ${
                                            mItem.threeMealCoveragePct >= 100
                                              ? 'bg-emerald-500'
                                              : 'bg-amber-500'
                                          }`}
                                          style={{ width: `${Math.min(100, mItem.threeMealCoveragePct)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= 4. OVERNIGHT & INVENTORY FULL DYNAMICS PANEL ================= */}
          {activeDeepTab === 'overnight' && (
            <div className="space-y-6">
              {/* Overnight Header Controls */}
              <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-white rounded-xl border border-purple-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      背包满包时间与过夜实战推演 (Lv.{focusedLevel} 阶段)
                    </h4>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      模拟夜间睡眠过程中的产出、满包时间点、自大胃王（Sneaky Snacking）溢出收益与食材/技能损失
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-purple-200 text-xs">
                  <BedDouble className="w-4 h-4 text-purple-600" />
                  <span className="font-semibold text-slate-700">睡眠时长:</span>
                  <input
                    type="number"
                    min={4.0}
                    max={12.0}
                    step={0.5}
                    value={sleepDurationHours}
                    onChange={(e) => setSleepDurationHours(Math.max(1, Math.min(16, Number(e.target.value))))}
                    className="input-field text-xs py-0.5 w-16 text-center font-bold"
                  />
                  <span className="text-slate-500">小时</span>
                </div>
              </div>

              {/* 4 Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500 flex items-center justify-between">
                    <span>背包持有上限</span>
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-800 mt-1">
                    {focusedProd.carryLimit}{' '}
                    <span className="text-xs font-semibold text-slate-500">格空间</span>
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    产出流速: {(focusedProd.carryLimit / Math.max(0.1, focusedProd.hoursToFullCarry)).toFixed(1)} 件/小时
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${
                  focusedProd.overnightAnalysis.isFullDuringSleep
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-emerald-50/70 border-emerald-200'
                }`}>
                  <div className={`text-2xs font-semibold flex items-center justify-between ${
                    focusedProd.overnightAnalysis.isFullDuringSleep ? 'text-amber-800' : 'text-emerald-800'
                  }`}>
                    <span>自然满包耗时</span>
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className={`text-2xl font-black mt-1 ${
                    focusedProd.overnightAnalysis.isFullDuringSleep ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {focusedProd.hoursToFullCarry.toFixed(1)}{' '}
                    <span className="text-xs font-semibold">小时</span>
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    {focusedProd.overnightAnalysis.isFullDuringSleep
                      ? `睡眠约 ${focusedProd.hoursToFullCarry.toFixed(1)}h 后满包进入自大胃王`
                      : '睡眠全程未满包，100%保留所有产出'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200">
                  <div className="text-2xs font-semibold text-purple-800 flex items-center justify-between">
                    <span>过夜实际总能量</span>
                    <Moon className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="text-2xl font-black text-purple-700 mt-1">
                    {Math.round(focusedProd.overnightAnalysis.totalOvernightEnergy).toLocaleString()}{' '}
                    <span className="text-xs font-semibold">能量</span>
                  </div>
                  <div className="text-2xs text-purple-900 mt-1">
                    理想无损 {Math.round(focusedProd.overnightAnalysis.idealOvernightEnergy).toLocaleString()} | 保持率{' '}
                    <strong>{(focusedProd.overnightAnalysis.efficiencyRatio * 100).toFixed(1)}%</strong>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200">
                  <div className="text-2xs font-semibold text-rose-800 flex items-center justify-between">
                    <span>过夜溢出损益预警</span>
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <div className="text-sm font-black text-rose-700 mt-1.5 space-y-0.5">
                    <div>
                      食材损失:{' '}
                      {focusedProd.overnightAnalysis.lostIngredients > 0
                        ? `-${focusedProd.overnightAnalysis.lostIngredients.toFixed(1)} 个`
                        : '0 (无损失)'}
                    </div>
                    <div>
                      技能损失:{' '}
                      {focusedProd.overnightAnalysis.lostSkillProcs > 0
                        ? `-${focusedProd.overnightAnalysis.lostSkillProcs.toFixed(2)} 次`
                        : '0 (无损失)'}
                    </div>
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    自大胃王转化: +{focusedProd.overnightAnalysis.sneakySnackBerries.toFixed(1)} 溢出树果直喂卡比兽
                  </div>
                </div>
              </div>

              {/* Daytime Recommendation Banner */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3 text-slate-700">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>日间实战收取建议</strong>：{focusedProd.overnightAnalysis.daytimeCollectionRecommendation}。
                  </span>
                </div>
                <div className="text-2xs text-slate-500 shrink-0">
                  日均帮忙 {focusedProd.dailyHelps.toFixed(1)} 次 (每隔 {focusedProd.helpingFrequency}s 帮忙一次)
                </div>
              </div>

              {/* Overnight Simulation Progress Bar Visualizer */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    <span>{sleepDurationHours} 小时睡眠时间轴分段拆解</span>
                  </span>
                  <span className="text-2xs text-slate-500">
                    满包点：第 {Math.min(sleepDurationHours, focusedProd.hoursToFullCarry).toFixed(1)} 小时
                  </span>
                </div>

                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex text-2xs font-bold text-white text-center">
                  <div
                    className="bg-emerald-500 h-full flex items-center justify-center"
                    style={{
                      width: `${Math.min(
                        100,
                        (Math.min(sleepDurationHours, focusedProd.hoursToFullCarry) / sleepDurationHours) * 100
                      )}%`,
                    }}
                  >
                    正常采摘 {Math.min(sleepDurationHours, focusedProd.hoursToFullCarry).toFixed(1)}h
                  </div>
                  {focusedProd.overnightAnalysis.timeInSneakySnackHours > 0 && (
                    <div
                      className="bg-amber-500 h-full flex items-center justify-center"
                      style={{
                        width: `${Math.min(
                          100,
                          (focusedProd.overnightAnalysis.timeInSneakySnackHours / sleepDurationHours) * 100
                        )}%`,
                      }}
                    >
                      自大胃王 {focusedProd.overnightAnalysis.timeInSneakySnackHours.toFixed(1)}h
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                    <div className="font-bold text-emerald-800 flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>阶段 1：满包前正常采摘 (0h ~ {Math.min(sleepDurationHours, focusedProd.hoursToFullCarry).toFixed(1)}h)</span>
                    </div>
                    <div className="mt-1.5 text-2xs text-emerald-900 space-y-0.5">
                      <div>• 获得树果：{focusedProd.overnightAnalysis.normalBerries.toFixed(1)} 颗 (塞入背包)</div>
                      <div>• 获得食材：{focusedProd.overnightAnalysis.overnightIngredients.toFixed(1)} 个 (塞入背包)</div>
                      <div>• 技能触发期望：{focusedProd.overnightAnalysis.overnightSkillProcs.toFixed(2)} 次</div>
                      <div>• 阶段小计能量：{Math.round(focusedProd.overnightAnalysis.normalEnergy).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                    <div className="font-bold text-amber-800 flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      <span>阶段 2：满包后自大胃王 ({Math.min(sleepDurationHours, focusedProd.hoursToFullCarry).toFixed(1)}h ~ {sleepDurationHours}h)</span>
                    </div>
                    <div className="mt-1.5 text-2xs text-amber-900 space-y-0.5">
                      <div>• 溢出树果：+{focusedProd.overnightAnalysis.sneakySnackBerries.toFixed(1)} 颗 (100%帮忙转换为树果直喂卡比兽)</div>
                      <div>• 溢出能量：+{Math.round(focusedProd.overnightAnalysis.sneakySnackEnergy).toLocaleString()}</div>
                      <div>• 停产食材损失：-{focusedProd.overnightAnalysis.lostIngredients.toFixed(1)} 个 (由于满包无法采摘)</div>
                      <div>• 停发技能损失：-{focusedProd.overnightAnalysis.lostSkillProcs.toFixed(2)} 次 (由于满包无法判定技能)</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* All Stages Overnight Progression Matrix Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">阶段等级</th>
                      <th className="py-2.5 px-3">持有上限</th>
                      <th className="py-2.5 px-3">帮忙间隔</th>
                      <th className="py-2.5 px-3">满包时间</th>
                      <th className="py-2.5 px-3">过夜正常 / 溢出时长</th>
                      <th className="py-2.5 px-3">过夜总能量</th>
                      <th className="py-2.5 px-3">过夜保持率</th>
                      <th className="py-2.5 px-3">满包损益预警</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multiReport.milestones.map((m) => {
                      const p = m.rating.currentProduction;
                      const o = p.overnightAnalysis;
                      const isSel = m.level === focusedLevel;
                      return (
                        <tr
                          key={m.level}
                          className={isSel ? 'bg-indigo-50/40 font-semibold' : ''}
                        >
                          <td className="py-2 px-3 font-bold text-slate-800">
                            Lv.{m.level}{' '}
                            <span className="text-2xs text-slate-400 font-normal">({m.unlockNote})</span>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-700">
                            {p.carryLimit} 格
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {p.helpingFrequency}s
                          </td>
                          <td className={`py-2 px-3 font-bold ${
                            o.isFullDuringSleep ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {o.timeToFullHours.toFixed(1)}h
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {Math.min(o.sleepHours, o.timeToFullHours).toFixed(1)}h / {o.timeInSneakySnackHours.toFixed(1)}h
                          </td>
                          <td className="py-2 px-3 font-bold text-purple-700">
                            {Math.round(o.totalOvernightEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-2xs font-extrabold ${
                              o.efficiencyRatio >= 0.95
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.efficiencyRatio >= 0.85
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}>
                              {(o.efficiencyRatio * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-2xs text-slate-500">
                            {o.lostIngredients > 0 ? (
                              <span className="text-rose-600">
                                损 {o.lostIngredients.toFixed(1)}食材, {o.lostSkillProcs.toFixed(1)}技
                              </span>
                            ) : (
                              <span className="text-emerald-600">全程无损</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Specialist Playstyle Advice */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>专长与游玩实战策略深度建议</span>
                </div>
                {species.specialty === 'berry' ? (
                  <p>
                    🍇 <strong>树果型特质</strong>：树果型宝可梦非常享受自大胃王机制。满包后 100% 帮忙转换为树果并直接喂给卡比兽，过夜能量基本不打折扣。即便睡前不收包，也能稳定产生可观的自大胃王树果能量。
                  </p>
                ) : species.specialty === 'ingredient' ? (
                  <p>
                    🍲 <strong>食材型特质</strong>：一旦满包，食材产出将彻底停滞！过夜期间溢出时长将导致宝贵的食材全部被吞掉。强烈建议：睡前务必清空背包，白天每 {focusedProd.hoursToFullCarry.toFixed(1)} 小时定时收取，或优先选择带有【持有上限提升 S/M/L】副技能的个体。
                  </p>
                ) : (
                  <p>
                    ⚡ <strong>技能型特质</strong>：满包后主技能无法再次触发！如果该宝可梦满包较快，过夜后半程将失去主技能发动的黄金机会。建议睡前点收，若夜间睡眠较长，可搭配【持有上限提升】副技能增加暂存空间。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
