import {
  GAME_DATA,
  type PokemonSpecies,
  type Nature,
  type Subskill,
  type Recipe,
  type RecipeType,
} from '@pokesleep/data';
import {
  calculateDailyProduction,
  EVALUATION_MILESTONE_LEVELS,
  EVALUATION_MILESTONE_LEVELS_STANDARD,
  EVALUATION_MILESTONE_LEVELS_PREVIEW,
  SUBSKILL_UNLOCK_LEVELS,
  type IngredientSelection,
  type ProductionResult,
  type SubskillsInput,
  type CookingScenarioContext,
} from '../production';
import { round } from '../formula/math';

export type EvaluationMetric =
  | 'auto'
  | 'total_energy'
  | 'berry_energy'
  | 'ingredient_energy'
  | 'ingredient_count'
  | 'skill_procs'
  | 'skill_energy';

export type ConcreteEvaluationMetric = Exclude<EvaluationMetric, 'auto'>;

export interface RatingParams {
  pokemon: PokemonSpecies | string;
  level?: number; // Target level to evaluate (default 30)
  nature?: Nature | string | null;
  subskills: SubskillsInput;
  ingredientSelection?: IngredientSelection | string; // e.g. 'AAA', 'ABC' or { slot0, slot30, slot60 }
  mainSkillLevel?: number;
  ribbonLevel?: number;
  goodCampTicket?: boolean;
  metric?: EvaluationMetric;
  isFavoredBerry?: boolean;
  mapBonus?: number;
  cookingContext?: CookingScenarioContext;
  sleepHours?: number;
  previewLv80?: boolean;
  mewLearnedSkill?: string;
  helpingBonusMode?: import('../formula').HelpingBonusMode;
}

export interface RatingResult {
  level: number;
  percentile: number; // Exact weighted percentile PR (0 to 100)
  grade: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
  percentagePosition: number; // (score - worst) / (best - worst) * 100
  relativeGain: number; // Gain % relative to neutral baseline
  evaluatedMetric: ConcreteEvaluationMetric;
  currentScore: number;
  baselineScore: number;
  bestScore: number;
  worstScore: number;
  currentProduction: ProductionResult;
  bestCombination: {
    natureName: string;
    subskillNames: string[];
    ingredientCombo: string;
    score: number;
  };
  worstCombination: {
    natureName: string;
    subskillNames: string[];
    ingredientCombo: string;
    score: number;
  };
}

export interface IndividualRecipeMatch {
  recipe: Recipe;
  matchedIngredients: Array<{
    ingredient: string;
    dailyProduced: number;
    directProduced: number;
    skillProduced: number;
    perMealRequired: number;
    threeMealRequired: number;
    threeMealCoveragePct: number; // 0..100+
  }>;
  totalMatchedDailyRatio: number; // How much of the recipe's bottleneck matched ingredient is met for 3 meals/day (0..100)
  singleMealCoveragePct: number; // Coverage against entire recipe (including non-produced partner ingredients) for 1 meal
  threeMealSelfSufficientForMatched: boolean; // True if ALL ingredients this mon produces for this dish meet 3x/day!
  isSoloCookable1Meal: boolean; // True if this mon ALONE produces 100% of ALL ingredients in the recipe (>= 1 meal/day)
  isSoloCookable3Meals: boolean; // True if this mon ALONE produces 100% of ALL ingredients in the recipe (>= 3 meals/day)
  mealsPerDayForMatched: number; // Min(dailyProduced / perMealRequired) across matched ingredients
}

export interface IndividualRecipeCoverageReport {
  producedIngredients: Array<{
    ingredient: string;
    dailyAmount: number;
    directAmount: number;
    skillAmount: number;
    dailyEnergy: number;
  }>;
  hasSkillIngredients: boolean;
  totalDirectDailyCount: number;
  totalSkillDailyCount: number;
  totalCombinedDailyCount: number;
  relevantRecipesTotal: number;
  threeMealPartnerReadyCount: number; // Dishes where this mon's slots cover 3 meals/day completely
  soloCookable1MealCount: number;
  soloCookable3MealsCount: number;
  byType: Record<
    RecipeType,
    {
      relevantCount: number;
      threeMealReadyCount: number;
      topDishes: IndividualRecipeMatch[];
    }
  >;
}

export interface MilestoneStageEvaluation {
  level: number;
  unlockNote: string; // e.g. '第1副技能', '第2副技能', '第2食材槽', '第3副技能', '第3食材槽', '第4副技能(满级上限)'
  rating: RatingResult;
}

export interface MultiStageEvaluationReport {
  pokemon: PokemonSpecies;
  evaluatedMetric: ConcreteEvaluationMetric;
  milestones: MilestoneStageEvaluation[];
  averagePercentile: number;
  peakStage: MilestoneStageEvaluation;
  lv60RecipeCoverage: IndividualRecipeCoverageReport;
}

export function percentileToGrade(pr: number): 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' {
  if (pr >= 95) return 'S+';
  if (pr >= 85) return 'S';
  if (pr >= 70) return 'A';
  if (pr >= 50) return 'B';
  if (pr >= 30) return 'C';
  return 'D';
}

// Subskill base draw weight by rarity:
// gold (7): 0.14 / 7 = 0.02, silver (6): 0.33 / 6 = 0.055, white (4): 0.53 / 4 = 0.1325
function getSubskillBaseProbability(s: Subskill): number {
  if (s.rarity === 'gold') return 0.14 / 7;
  if (s.rarity === 'silver') return 0.33 / 6;
  return 0.53 / 4;
}

// Cached deduplicated subskill effect groups per slot count k in [1..5]
interface SubskillEffectGroup {
  representativeSubs: Subskill[];
  totalWeight: number;
}

const subskillGroupsCache = new Map<number, SubskillEffectGroup[]>();

function getSubskillEffectKey(subs: Subskill[]): string {
  let speed = 0;
  let bfs = 0;
  let hb = 0;
  let ing = 0;
  let skillTrig = 0;
  let skillLvl = 0;

  for (const s of subs) {
    switch (s.name) {
      case 'Helping Speed S':
        speed += 7;
        break;
      case 'Helping Speed M':
        speed += 14;
        break;
      case 'Helping Bonus':
        hb = 1;
        break;
      case 'Berry Finding S':
        bfs = 1;
        break;
      case 'Ingredient Finder S':
        ing += 18;
        break;
      case 'Ingredient Finder M':
        ing += 36;
        break;
      case 'Skill Trigger S':
        skillTrig += 18;
        break;
      case 'Skill Trigger M':
        skillTrig += 36;
        break;
      case 'Skill Level Up S':
        skillLvl += 1;
        break;
      case 'Skill Level Up M':
        skillLvl += 2;
        break;
      default:
        // Inventory / EXP / ERB / Dream Shard have identical 0 impact on L1 infinite-awake / expected rate formulas
        break;
    }
  }
  return `${speed}|${hb}|${bfs}|${ing}|${skillTrig}|${skillLvl}`;
}

function getDeduplicatedSubskillGroups(targetSlots: number): SubskillEffectGroup[] {
  const k = Math.max(1, Math.min(5, targetSlots));
  const cached = subskillGroupsCache.get(k);
  if (cached) return cached;

  const allSubskills = GAME_DATA.subskills;
  const map = new Map<string, SubskillEffectGroup>();

  function backtrack(startIdx: number, chosen: Subskill[], weightProd: number) {
    if (chosen.length === k) {
      const key = getSubskillEffectKey(chosen);
      const existing = map.get(key);
      if (existing) {
        existing.totalWeight += weightProd;
      } else {
        map.set(key, {
          representativeSubs: [...chosen],
          totalWeight: weightProd,
        });
      }
      return;
    }
    for (let i = startIdx; i < allSubskills.length; i++) {
      const s = allSubskills[i];
      chosen.push(s);
      backtrack(i + 1, chosen, weightProd * getSubskillBaseProbability(s));
      chosen.pop();
    }
  }

  backtrack(0, [], 1.0);
  const groups = Array.from(map.values());
  subskillGroupsCache.set(k, groups);
  return groups;
}

interface NatureEffectGroup {
  representativeNature: Nature;
  weight: number;
}

let cachedNatureGroups: NatureEffectGroup[] | null = null;

function getDeduplicatedNatureGroups(): NatureEffectGroup[] {
  if (cachedNatureGroups) return cachedNatureGroups;
  const natures = GAME_DATA.natures;
  const map = new Map<string, NatureEffectGroup>();
  const singleW = 1.0 / natures.length;

  for (const n of natures) {
    const speedKey = n.positiveModifier === 'speed' ? '+' : n.negativeModifier === 'speed' ? '-' : '0';
    const key = `${speedKey}|${n.modifiers.ingredient}|${n.modifiers.skill}`;
    const existing = map.get(key);
    if (existing) {
      existing.weight += singleW;
    } else {
      map.set(key, { representativeNature: n, weight: singleW });
    }
  }
  cachedNatureGroups = Array.from(map.values());
  return cachedNatureGroups;
}

function getPossibleIngredientCombosAtLevel(
  mon: PokemonSpecies,
  level: number
): Array<{ code: string; weight: number }> {
  const valid30 = (mon.ingredient30 || []).filter(i => i.ingredient !== 'Locked');
  const valid60 = (mon.ingredient60 || []).filter(i => i.ingredient !== 'Locked');

  if (level < 30 || valid30.length === 0) {
    return [{ code: 'A', weight: 1.0 }];
  }

  const letters30 = valid30.map((_, idx) => String.fromCharCode(65 + idx));
  if (level < 60 || valid60.length === 0) {
    // 2 unlocked slots: uniform across valid30 options (typically AA: 1/2, AB: 1/2; or probs config)
    const probs2 = GAME_DATA.probabilities?.ingredients?.combo_2_ingredients;
    const combos = letters30.map(l30 => `A${l30}`);
    return combos.map(c => ({
      code: c,
      weight: probs2?.[c] ?? 1.0 / combos.length,
    }));
  }

  // Level >= 60: 3 unlocked slots
  // Note: in Pokémon Sleep, if slot 30 is A (1/2) or B (1/2), slot 60 rolls among unlocked pool (A/B or A/B/C)
  const probs3 = GAME_DATA.probabilities?.ingredients?.combo_3_ingredients;
  const letters60 = valid60.map((_, idx) => String.fromCharCode(65 + idx));
  const combos: Array<{ code: string; weight: number }> = [];
  for (const l30 of letters30) {
    // At Lv.60: if l30 === 'A', Pokémon Sleep unlocks A, B (2 options, NOT C unless C exists? Actually slot60 pool is A,B,C: AAA, AAB, AAC, ABA, ABB, ABC)
    for (const l60 of letters60) {
      const code = `A${l30}${l60}`;
      const w = probs3?.[code] ?? 1.0 / (letters30.length * letters60.length);
      if (w > 0) {
        combos.push({ code, weight: w });
      }
    }
  }
  return combos.length > 0 ? combos : [{ code: 'AAA', weight: 1.0 }];
}

function extractMetricValue(prod: ProductionResult, metric: ConcreteEvaluationMetric): number {
  switch (metric) {
    case 'berry_energy':
      return prod.dailyBerryEnergy;
    case 'ingredient_energy':
      return prod.dailyIngredientEnergy;
    case 'ingredient_count':
      return prod.dailyIngredientCount;
    case 'skill_procs':
      return prod.dailySkillProcs;
    case 'skill_energy':
      return prod.dailySkillEnergy;
    case 'total_energy':
    default:
      return prod.totalDailyEnergy;
  }
}

export function resolveDefaultMetric(mon: PokemonSpecies, metric: EvaluationMetric = 'auto'): ConcreteEvaluationMetric {
  if (metric !== 'auto') return metric;
  if (mon.specialty === 'berry') return 'total_energy';
  if (mon.specialty === 'ingredient') return 'ingredient_energy';
  if (mon.specialty === 'skill') return 'skill_procs';
  return 'total_energy';
}

/**
 * Evaluates an individual Pokémon's roll within its species' exact combinatorial space at `level`.
 * Uses Effect Vector Deduplication to evaluate 100% of combinations accurately in <10ms.
 */
export function ratePokemon(params: RatingParams): RatingResult {
  const {
    pokemon: rawPokemon,
    level = 30,
    nature: rawNature,
    subskills: rawSubskills,
    ingredientSelection = 'AAA',
    mainSkillLevel = 1,
    ribbonLevel = 0,
    goodCampTicket = false,
    metric = 'auto',
    isFavoredBerry = false,
    mapBonus = 0,
    cookingContext,
    sleepHours = 8.5,
    previewLv80 = false,
    mewLearnedSkill,
    helpingBonusMode = 'individual25',
  } = params;

  const mon =
    typeof rawPokemon === 'string'
      ? GAME_DATA.pokemon.find(
          p =>
            p.name.toUpperCase() === rawPokemon.toUpperCase() ||
            p.displayName.toLowerCase() === rawPokemon.toLowerCase() ||
            p.translations['zh-CN'] === rawPokemon ||
            p.translations['zh-TW'] === rawPokemon
        )
      : rawPokemon;

  if (!mon) throw new Error(`Pokemon species not found: ${rawPokemon}`);

  const evaluatedMetric = resolveDefaultMetric(mon, metric);
  const allowPreview = previewLv80 || level >= 80;

  // 1. Current individual production
  const currentProd = calculateDailyProduction({
    pokemon: mon,
    level,
    nature: rawNature,
    subskills: rawSubskills,
    ingredientSelection,
    mainSkillLevel,
    ribbonLevel,
    goodCampTicket,
    isFavoredBerry,
    mapBonus,
    cookingContext,
    sleepHours,
    allowPreviewLv80: allowPreview,
    mewLearnedSkill,
    helpingBonusMode,
  });
  const currentScore = extractMetricValue(currentProd, evaluatedMetric);

  // 2. Neutral Baseline individual (neutral nature, no subskills, AAA baseline)
  const baselineProd = calculateDailyProduction({
    pokemon: mon,
    level,
    nature: null,
    subskills: [],
    ingredientSelection: 'AAA',
    mainSkillLevel,
    ribbonLevel,
    goodCampTicket,
    isFavoredBerry,
    mapBonus,
    cookingContext,
    sleepHours,
    allowPreviewLv80: allowPreview,
    mewLearnedSkill,
    helpingBonusMode,
  });
  const baselineScore = extractMetricValue(baselineProd, evaluatedMetric);

  // 3. Exact combinatorial enumeration over unlocked subskill slots ([10, 25, 50, 70, 80])
  const numUnlockedSlots = SUBSKILL_UNLOCK_LEVELS.filter(lvl => level >= lvl).length;
  const targetSlots = Math.max(1, Math.min(numUnlockedSlots, 5));

  const subskillGroups = getDeduplicatedSubskillGroups(targetSlots);
  const natureGroups = getDeduplicatedNatureGroups();
  const possibleIngCombos = getPossibleIngredientCombosAtLevel(mon, level);

  let totalWeight = 0;
  let lowerScoreWeight = 0;
  let equalScoreWeight = 0;

  let bestScore = -Infinity;
  let worstScore = Infinity;
  let bestCombination = { natureName: '', subskillNames: [] as string[], ingredientCombo: '', score: -Infinity };
  let worstCombination = { natureName: '', subskillNames: [] as string[], ingredientCombo: '', score: Infinity };

  for (const natGroup of natureGroups) {
    for (const ingCombo of possibleIngCombos) {
      const outerW = natGroup.weight * ingCombo.weight;

      for (const subGroup of subskillGroups) {
        const weight = outerW * subGroup.totalWeight;
        totalWeight += weight;

        const prod = calculateDailyProduction({
          pokemon: mon,
          level,
          nature: natGroup.representativeNature,
          subskills: subGroup.representativeSubs,
          ingredientSelection: ingCombo.code,
          mainSkillLevel,
          ribbonLevel,
          goodCampTicket,
          isFavoredBerry,
          mapBonus,
          cookingContext,
          sleepHours,
          allowPreviewLv80: allowPreview,
          mewLearnedSkill,
          helpingBonusMode,
        });

        const score = extractMetricValue(prod, evaluatedMetric);

        if (score < currentScore - 1e-7) {
          lowerScoreWeight += weight;
        } else if (Math.abs(score - currentScore) <= 1e-7) {
          equalScoreWeight += weight;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCombination = {
            natureName: natGroup.representativeNature.name,
            subskillNames: subGroup.representativeSubs.map(s => s.name),
            ingredientCombo: ingCombo.code,
            score,
          };
        }

        if (score < worstScore) {
          worstScore = score;
          worstCombination = {
            natureName: natGroup.representativeNature.name,
            subskillNames: subGroup.representativeSubs.map(s => s.name),
            ingredientCombo: ingCombo.code,
            score,
          };
        }
      }
    }
  }

  const percentile = totalWeight > 0 ? round(((lowerScoreWeight + 0.5 * equalScoreWeight) / totalWeight) * 100, 1) : 50;
  const scoreSpan = bestScore - worstScore;
  const percentagePosition = scoreSpan > 0 ? round(((currentScore - worstScore) / scoreSpan) * 100, 1) : 50;
  const relativeGain = baselineScore > 0 ? round(((currentScore - baselineScore) / baselineScore) * 100, 1) : 0;

  return {
    level,
    percentile,
    grade: percentileToGrade(percentile),
    percentagePosition,
    relativeGain,
    evaluatedMetric,
    currentScore: round(currentScore, 2),
    baselineScore: round(baselineScore, 2),
    bestScore: round(bestScore, 2),
    worstScore: round(worstScore, 2),
    currentProduction: currentProd,
    bestCombination: {
      ...bestCombination,
      score: round(bestCombination.score, 2),
    },
    worstCombination: {
      ...worstCombination,
      score: round(worstCombination.score, 2),
    },
  };
}

/**
 * Analyze single-Pokémon recipe coverage & dish compatibility across Curries, Salads, and Desserts.
 * Crucial for Ingredient Specialists (evaluates daily output vs 1-meal and 3-meals/day requirements).
 */
export function analyzeIndividualRecipeCoverage(
  prod: ProductionResult,
  potCapacity: number = 69,
  options?: { includeSkillIngredients?: boolean }
): IndividualRecipeCoverageReport {
  const includeSkill = options?.includeSkillIngredients ?? true;

  // Direct helping map
  const directMap = new Map<string, number>();
  for (const item of prod.dailyIngredients || []) {
    directMap.set(item.ingredient.toLowerCase(), item.amount);
  }

  // Skill acquisition map
  const skillMap = new Map<string, number>();
  if (includeSkill && prod.skillDailyIngredients) {
    for (const item of prod.skillDailyIngredients) {
      skillMap.set(item.ingredient.toLowerCase(), item.amount);
    }
  }

  // Combined daily ingredient map (amount, directAmount, skillAmount, energy)
  const combinedMap = new Map<
    string,
    { amount: number; directAmount: number; skillAmount: number; energy: number }
  >();

  const activeIngredients =
    includeSkill && prod.combinedDailyIngredients
      ? prod.combinedDailyIngredients
      : prod.dailyIngredients || [];

  for (const item of activeIngredients) {
    const key = item.ingredient.toLowerCase();
    const dAmt = directMap.get(key) || 0;
    const sAmt = skillMap.get(key) || 0;
    combinedMap.set(key, {
      amount: item.amount,
      directAmount: dAmt,
      skillAmount: sAmt,
      energy: item.energy,
    });
  }

  // Build producedList:
  // 1. Direct ingredients in their original unlocked slots order
  const producedList: IndividualRecipeCoverageReport['producedIngredients'] = [];
  const seenIngs = new Set<string>();

  for (const item of prod.dailyIngredients || []) {
    const key = item.ingredient.toLowerCase();
    const data = combinedMap.get(key);
    if (!data || seenIngs.has(key)) continue;
    seenIngs.add(key);
    producedList.push({
      ingredient: item.ingredient,
      dailyAmount: round(data.amount, 1),
      directAmount: round(data.directAmount, 1),
      skillAmount: round(data.skillAmount, 1),
      dailyEnergy: round(data.energy, 0),
    });
  }

  // 2. Skill-only acquired ingredients (sorted by daily amount descending)
  const skillOnlyItems: IndividualRecipeCoverageReport['producedIngredients'] = [];
  for (const [key, data] of combinedMap.entries()) {
    if (seenIngs.has(key)) continue;
    seenIngs.add(key);
    const ingObj = GAME_DATA.ingredients.find(i => i.name.toLowerCase() === key);
    const ingName = ingObj ? ingObj.name : key;
    skillOnlyItems.push({
      ingredient: ingName,
      dailyAmount: round(data.amount, 1),
      directAmount: round(data.directAmount, 1),
      skillAmount: round(data.skillAmount, 1),
      dailyEnergy: round(data.energy, 0),
    });
  }
  skillOnlyItems.sort((a, b) => b.dailyAmount - a.dailyAmount);
  producedList.push(...skillOnlyItems);

  const byType: IndividualRecipeCoverageReport['byType'] = {
    curry: { relevantCount: 0, threeMealReadyCount: 0, topDishes: [] },
    salad: { relevantCount: 0, threeMealReadyCount: 0, topDishes: [] },
    dessert: { relevantCount: 0, threeMealReadyCount: 0, topDishes: [] },
  };

  let relevantRecipesTotal = 0;
  let threeMealPartnerReadyCount = 0;
  let soloCookable1MealCount = 0;
  let soloCookable3MealsCount = 0;

  const allMatchesByType: Record<RecipeType, IndividualRecipeMatch[]> = {
    curry: [],
    salad: [],
    dessert: [],
  };

  for (const recipe of GAME_DATA.recipes) {
    if (recipe.nrOfIngredients > potCapacity && potCapacity > 0) {
      // Still analyze high-tier dishes even if pot needs expansion, or allow large pot default (69)
    }

    const matchedIngredients: IndividualRecipeMatch['matchedIngredients'] = [];
    let minMatchedThreeMealPct = Infinity;
    let minMatchedMealsPerDay = Infinity;
    let totalCovered1Meal = 0;
    let allRecipeIngredientsCovered1 = true;
    let allRecipeIngredientsCovered3 = true;

    for (const req of recipe.ingredients) {
      const data = combinedMap.get(req.ingredient.toLowerCase());
      const produced = data?.amount ?? 0;
      const directProduced = data?.directAmount ?? 0;
      const skillProduced = data?.skillAmount ?? 0;
      const threeReq = req.amount * 3;
      totalCovered1Meal += Math.min(produced, req.amount);

      if (produced < req.amount) allRecipeIngredientsCovered1 = false;
      if (produced < threeReq) allRecipeIngredientsCovered3 = false;

      // Meaningful threshold for match (>= 0.05 / day)
      if (produced >= 0.05) {
        const pct3 = threeReq > 0 ? (produced / threeReq) * 100 : 100;
        const mealsDay = req.amount > 0 ? produced / req.amount : 0;
        if (pct3 < minMatchedThreeMealPct) minMatchedThreeMealPct = pct3;
        if (mealsDay < minMatchedMealsPerDay) minMatchedMealsPerDay = mealsDay;

        matchedIngredients.push({
          ingredient: req.ingredient,
          dailyProduced: round(produced, 1),
          directProduced: round(directProduced, 1),
          skillProduced: round(skillProduced, 1),
          perMealRequired: req.amount,
          threeMealRequired: threeReq,
          threeMealCoveragePct: round(pct3, 1),
        });
      }
    }

    if (matchedIngredients.length === 0) continue;

    relevantRecipesTotal += 1;
    byType[recipe.type].relevantCount += 1;

    const threeMealSelfSufficientForMatched = minMatchedThreeMealPct >= 100;
    if (threeMealSelfSufficientForMatched) {
      threeMealPartnerReadyCount += 1;
      byType[recipe.type].threeMealReadyCount += 1;
    }
    if (allRecipeIngredientsCovered1) soloCookable1MealCount += 1;
    if (allRecipeIngredientsCovered3) soloCookable3MealsCount += 1;

    const singleMealCoveragePct =
      recipe.nrOfIngredients > 0 ? round((totalCovered1Meal / recipe.nrOfIngredients) * 100, 1) : 0;

    allMatchesByType[recipe.type].push({
      recipe,
      matchedIngredients,
      totalMatchedDailyRatio: round(Math.min(100, minMatchedThreeMealPct), 1),
      singleMealCoveragePct,
      threeMealSelfSufficientForMatched,
      isSoloCookable1Meal: allRecipeIngredientsCovered1,
      isSoloCookable3Meals: allRecipeIngredientsCovered3,
      mealsPerDayForMatched: round(isFinite(minMatchedMealsPerDay) ? minMatchedMealsPerDay : 0, 2),
    });
  }

  for (const rType of ['curry', 'salad', 'dessert'] as RecipeType[]) {
    allMatchesByType[rType].sort((a, b) => {
      // Rank high-value dishes where matched ingredients are well-supplied at the top
      const scoreA =
        (a.isSoloCookable3Meals ? 2.5 : a.threeMealSelfSufficientForMatched ? 1.4 : a.totalMatchedDailyRatio / 100) *
        Math.pow(a.recipe.valueMax || a.recipe.value, 0.65) *
        (0.5 + 0.5 * (a.matchedIngredients.length / a.recipe.ingredients.length));
      const scoreB =
        (b.isSoloCookable3Meals ? 2.5 : b.threeMealSelfSufficientForMatched ? 1.4 : b.totalMatchedDailyRatio / 100) *
        Math.pow(b.recipe.valueMax || b.recipe.value, 0.65) *
        (0.5 + 0.5 * (b.matchedIngredients.length / b.recipe.ingredients.length));
      return scoreB - scoreA;
    });
    byType[rType].topDishes = allMatchesByType[rType].slice(0, 6);
  }

  return {
    producedIngredients: producedList,
    hasSkillIngredients: (prod.skillDailyIngredientCount ?? 0) > 0,
    totalDirectDailyCount: round(prod.dailyIngredientCount ?? 0, 1),
    totalSkillDailyCount: round(prod.skillDailyIngredientCount ?? 0, 1),
    totalCombinedDailyCount: round(prod.combinedDailyIngredientCount ?? prod.dailyIngredientCount ?? 0, 1),
    relevantRecipesTotal,
    threeMealPartnerReadyCount,
    soloCookable1MealCount,
    soloCookable3MealsCount,
    byType,
  };
}

export const MILESTONE_NOTES: Record<number, string> = {
  10: '解锁第1副技能',
  25: '解锁第2副技能',
  30: '解锁第2食材槽',
  50: '解锁第3副技能',
  60: '解锁第3食材槽',
  70: '解锁第4副技能 (当前版本上限)',
  80: '解锁第5副技能 (未来前瞻)',
};

/**
 * Automatically evaluates a Pokémon across progression milestones
 * (Standard: Lv.10, 25, 30, 50, 60, 70; Preview: includes Lv.80).
 */
export function evaluatePokemonMilestones(
  params: Omit<RatingParams, 'level'> & {
    levels?: readonly number[];
    potCapacity?: number;
    previewLv80?: boolean;
  }
): MultiStageEvaluationReport {
  const {
    previewLv80 = false,
    levels = previewLv80 ? EVALUATION_MILESTONE_LEVELS_PREVIEW : EVALUATION_MILESTONE_LEVELS_STANDARD,
    potCapacity = 100,
    ...rest
  } = params;

  const milestones: MilestoneStageEvaluation[] = levels.map(lvl => ({
    level: lvl,
    unlockNote: MILESTONE_NOTES[lvl] || `Lv.${lvl}`,
    rating: ratePokemon({ ...rest, level: lvl }),
  }));

  const firstRating = milestones[0].rating;
  const pokemon = firstRating.currentProduction.pokemon;
  const evaluatedMetric = firstRating.evaluatedMetric;

  const sumPr = milestones.reduce((acc, m) => acc + m.rating.percentile, 0);
  const averagePercentile = round(sumPr / milestones.length, 1);

  let peakStage = milestones[0];
  for (const m of milestones) {
    if (m.rating.percentile >= peakStage.rating.percentile) {
      peakStage = m;
    }
  }

  const lv60Stage = milestones.find(m => m.level === 60) || milestones[milestones.length - 1];
  const lv60RecipeCoverage = analyzeIndividualRecipeCoverage(lv60Stage.rating.currentProduction, potCapacity);

  return {
    pokemon,
    evaluatedMetric,
    milestones,
    averagePercentile,
    peakStage,
    lv60RecipeCoverage,
  };
}
