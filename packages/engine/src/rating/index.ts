import {
  GAME_DATA,
  type PokemonSpecies,
  type Nature,
  type Subskill,
} from '@pokesleep/data';
import {
  calculateDailyProduction,
  resolveIngredientsForSlots,
  SUBSKILL_UNLOCK_LEVELS,
  type ProductionResult,
} from '../production';
import { round } from '../formula/math';

export type EvaluationMetric =
  | 'auto'
  | 'total_energy'
  | 'berry_energy'
  | 'ingredient_energy'
  | 'skill_procs'
  | 'skill_energy';

export interface RatingParams {
  pokemon: PokemonSpecies | string;
  level?: number; // Target level to evaluate (default 30)
  nature?: Nature | string | null;
  subskills: Array<Subskill | string>;
  ingredientSelection?: string; // e.g. 'AAA', 'ABC'
  mainSkillLevel?: number;
  ribbonLevel?: number;
  goodCampTicket?: boolean;
  metric?: EvaluationMetric;
  isFavoredBerry?: boolean;
  mapBonus?: number;
}

export interface RatingResult {
  percentile: number; // Weighted percentile PR (0 to 100)
  percentagePosition: number; // (score - worst) / (best - worst) * 100
  relativeGain: number; // Gain % relative to neutral baseline
  evaluatedMetric: 'total_energy' | 'berry_energy' | 'ingredient_energy' | 'skill_procs' | 'skill_energy';
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

// Probability weights for subskill drawing:
// gold (7): 0.14 / 7 = 0.02
// silver (6): 0.33 / 6 = 0.055
// white (4): 0.53 / 4 = 0.1325
function getSubskillBaseProbability(s: Subskill): number {
  if (s.rarity === 'gold') return 0.14 / 7;
  if (s.rarity === 'silver') return 0.33 / 6;
  return 0.53 / 4;
}

// Get ingredient combo probability from probabilities config
function getIngredientComboWeight(combo: string): number {
  const c = combo.toUpperCase();
  const probs = GAME_DATA.probabilities?.ingredients;
  if (probs?.combo_3_ingredients?.[c]) return probs.combo_3_ingredients[c];
  if (probs?.combo_2_ingredients?.[c]) return probs.combo_2_ingredients[c];
  return 1.0 / 9;
}

function extractMetricValue(
  prod: ProductionResult,
  metric: 'total_energy' | 'berry_energy' | 'ingredient_energy' | 'skill_procs' | 'skill_energy'
): number {
  switch (metric) {
    case 'berry_energy':
      return prod.dailyBerryEnergy;
    case 'ingredient_energy':
      return prod.dailyIngredientEnergy;
    case 'skill_procs':
      return prod.dailySkillProcs;
    case 'skill_energy':
      return prod.dailySkillEnergy;
    case 'total_energy':
    default:
      return prod.totalDailyEnergy;
  }
}

/**
 * Evaluates an individual Pokémon's roll within its species' possible space.
 * Returns PR (percentile rank), % position between worst and best, and relative gain.
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
  } = params;

  const mon =
    typeof rawPokemon === 'string'
      ? GAME_DATA.pokemon.find(
          p =>
            p.name.toUpperCase() === rawPokemon.toUpperCase() ||
            p.displayName.toLowerCase() === rawPokemon.toLowerCase() ||
            p.translations['zh-CN'] === rawPokemon
        )
      : rawPokemon;

  if (!mon) throw new Error(`Pokemon species not found: ${rawPokemon}`);

  // Determine evaluation metric
  let evaluatedMetric: 'total_energy' | 'berry_energy' | 'ingredient_energy' | 'skill_procs' | 'skill_energy' = 'total_energy';
  if (metric === 'auto') {
    if (mon.specialty === 'berry') evaluatedMetric = 'total_energy';
    else if (mon.specialty === 'ingredient') evaluatedMetric = 'ingredient_energy';
    else if (mon.specialty === 'skill') evaluatedMetric = 'skill_procs';
    else evaluatedMetric = 'total_energy';
  } else {
    evaluatedMetric = metric;
  }

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
  });
  const currentScore = extractMetricValue(currentProd, evaluatedMetric);

  // 2. Neutral Baseline individual (no nature, no subskills)
  const baselineProd = calculateDailyProduction({
    pokemon: mon,
    level,
    nature: null,
    subskills: [],
    ingredientSelection,
    mainSkillLevel,
    ribbonLevel,
    goodCampTicket,
    isFavoredBerry,
    mapBonus,
  });
  const baselineScore = extractMetricValue(baselineProd, evaluatedMetric);

  // 3. Enumerate possible combinations for this species at target level
  const numUnlockedSlots = SUBSKILL_UNLOCK_LEVELS.filter(lvl => level >= lvl).length;
  const targetSlots = Math.max(1, Math.min(numUnlockedSlots, 5));

  // Generate k-combinations of subskills
  const allSubskills = GAME_DATA.subskills;
  const subskillCombinations: Subskill[][] = [];

  function pickSubskills(startIndex: number, currentCombo: Subskill[]) {
    if (currentCombo.length === targetSlots) {
      subskillCombinations.push([...currentCombo]);
      return;
    }
    for (let i = startIndex; i < allSubskills.length; i++) {
      currentCombo.push(allSubskills[i]);
      pickSubskills(i + 1, currentCombo);
      currentCombo.pop();
    }
  }
  pickSubskills(0, []);

  // Ingredient combos: determine possible combos for this species
  const hasSlot30 = (mon.ingredient30 || []).some(i => i.ingredient !== 'Locked');
  const hasSlot60 = (mon.ingredient60 || []).some(i => i.ingredient !== 'Locked');
  let possibleCombos = ['AAA'];
  if (hasSlot30 && hasSlot60) {
    possibleCombos = ['AAA', 'AAB', 'AAC', 'ABA', 'ABB', 'ABC'];
  } else if (hasSlot30) {
    possibleCombos = ['AAA', 'AAB', 'ABA', 'ABB'];
  }

  // To maintain fast performance (<100ms) for rating, we evaluate representative nature groups
  // (21 distinct nature profiles)
  const natures = GAME_DATA.natures;

  let totalWeight = 0;
  let lowerScoreWeight = 0;
  let equalScoreWeight = 0;

  let bestScore = -Infinity;
  let worstScore = Infinity;
  let bestCombination = { natureName: '', subskillNames: [] as string[], ingredientCombo: '', score: -Infinity };
  let worstCombination = { natureName: '', subskillNames: [] as string[], ingredientCombo: '', score: Infinity };

  // Sample or full grid evaluation
  // If combinations > 4000, sample uniformly with stratified weights
  const maxSubCombos = subskillCombinations.length > 500 ? 500 : subskillCombinations.length;
  const step = Math.max(1, Math.floor(subskillCombinations.length / maxSubCombos));
  const sampledSubCombos: Subskill[][] = [];
  for (let i = 0; i < subskillCombinations.length; i += step) {
    sampledSubCombos.push(subskillCombinations[i]);
  }

  for (const n of natures) {
    const natureWeight = 1.0 / natures.length;

    for (const comboCode of possibleCombos) {
      const ingWeight = getIngredientComboWeight(comboCode);

      for (const subs of sampledSubCombos) {
        // Approximate subskill draw probability
        let subWeight = 1.0;
        for (const s of subs) {
          subWeight *= getSubskillBaseProbability(s);
        }
        const weight = natureWeight * ingWeight * subWeight;
        totalWeight += weight;

        const prod = calculateDailyProduction({
          pokemon: mon,
          level,
          nature: n,
          subskills: subs,
          ingredientSelection: comboCode,
          mainSkillLevel,
          ribbonLevel,
          goodCampTicket,
          isFavoredBerry,
          mapBonus,
        });

        const score = extractMetricValue(prod, evaluatedMetric);

        if (score < currentScore - 1e-9) {
          lowerScoreWeight += weight;
        } else if (Math.abs(score - currentScore) <= 1e-9) {
          equalScoreWeight += weight;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCombination = {
            natureName: n.name,
            subskillNames: subs.map(s => s.name),
            ingredientCombo: comboCode,
            score,
          };
        }

        if (score < worstScore) {
          worstScore = score;
          worstCombination = {
            natureName: n.name,
            subskillNames: subs.map(s => s.name),
            ingredientCombo: comboCode,
            score,
          };
        }
      }
    }
  }

  // Calculate Weighted Percentile (PR):
  // PR = (lowerWeight + 0.5 * equalWeight) / totalWeight * 100
  const percentile = totalWeight > 0 ? round(((lowerScoreWeight + 0.5 * equalScoreWeight) / totalWeight) * 100, 1) : 50;

  // Percentage position between worst and best
  const scoreSpan = bestScore - worstScore;
  const percentagePosition = scoreSpan > 0 ? round(((currentScore - worstScore) / scoreSpan) * 100, 1) : 50;

  // Relative gain over baseline individual
  const relativeGain = baselineScore > 0 ? round(((currentScore - baselineScore) / baselineScore) * 100, 1) : 0;

  return {
    percentile,
    percentagePosition,
    relativeGain,
    evaluatedMetric,
    currentScore: round(currentScore, 1),
    baselineScore: round(baselineScore, 1),
    bestScore: round(bestScore, 1),
    worstScore: round(worstScore, 1),
    currentProduction: currentProd,
    bestCombination,
    worstCombination,
  };
}

