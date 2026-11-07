export type Locale = 'zh-CN' | 'zh-TW' | 'ja' | 'en';

export type Specialty = 'berry' | 'ingredient' | 'skill' | 'all';

export type SubskillRarity = 'gold' | 'silver' | 'white';

export type RecipeType = 'curry' | 'salad' | 'dessert';

export type NatureModifier = 'speed' | 'ingredient' | 'skill' | 'energy' | 'exp' | 'neutral';

export interface MultilingualText {
  'zh-CN': string;
  'zh-TW': string;
  ja: string;
  en: string;
}

export interface Metadata {
  version: string;
  schemaVersion: string;
  generatedAt: string;
  attribution: {
    nerolisLab: string;
    pokeapi: string;
    raenonxAndMathcord: string;
    licenseDoc: string;
  };
}

export interface IngredientSlotItem {
  ingredient: string;
  amount: number;
}

export type MainskillUnit =
  | 'energy'
  | 'berries'
  | 'berry zone'
  | 'ingredients'
  | 'helps'
  | 'skill helps'
  | 'dream shards'
  | 'strength'
  | 'pot size'
  | 'crit chance'
  | 'candy'
  | 'items';

export interface SkillActivationEntry {
  unit: MainskillUnit;
  amounts: number[];
  teamAmounts?: number[];
  critAmounts?: number[];
}

export interface PokemonSkillInfo {
  name: string;
  modifierName: string | null;
  baseSkillName: string;
  maxLevel: number;
  RP: number[];
  strengthAmounts?: number[];
  image: string;
  activations?: Record<string, SkillActivationEntry>;
  descriptions?: string[];
  critChance?: number;
  critMultiplier?: number;
  translations?: MultilingualText;
}

export interface PokemonSpecies {
  name: string;
  displayName: string;
  pokedexNumber: number;
  specialty: Specialty;
  type: string;
  frequency: number;
  ingredientPercentage: number;
  skillPercentage: number;
  berry: string;
  carrySize: number;
  previousEvolutions: number;
  remainingEvolutions: number;
  evolvesFrom: string | null;
  evolvesInto: string[];
  ingredient0: IngredientSlotItem[];
  ingredient30: IngredientSlotItem[];
  ingredient60: IngredientSlotItem[];
  skill: PokemonSkillInfo;
  pityProcThreshold: number;
  shinyLocked: boolean;
  translations: MultilingualText;
}

export interface Berry {
  name: string;
  type: string;
  value: number;
  translations: MultilingualText;
}

export interface Ingredient {
  name: string;
  longName: string;
  value: number;
  taxedValue: number;
  translations: MultilingualText;
  aliases?: string[];
}

export interface RecipeIngredient {
  ingredient: string;
  amount: number;
}

export interface Recipe {
  name: string;
  displayName: string;
  type: RecipeType;
  value: number;
  valueMax: number;
  bonus: number;
  nrOfIngredients: number;
  ingredients: RecipeIngredient[];
  translations: MultilingualText;
  aliases?: string[];
}

export interface NatureModifiers {
  frequency: number;
  ingredient: number;
  skill: number;
  energy: number;
  exp: number;
}

export interface Nature {
  name: string;
  positiveModifier: NatureModifier;
  negativeModifier: NatureModifier;
  modifiers: NatureModifiers;
  translations: MultilingualText;
}

export interface Subskill {
  name: string;
  shortName: string;
  rarity: SubskillRarity;
  amount: number;
  translations: MultilingualText;
  aliases?: string[];
}

export interface Island {
  name: string;
  shortName: string;
  berries: string[];
  rankThresholds: number[];
  translations: MultilingualText;
  aliases?: string[];
}

export interface RibbonRules {
  frequencyBonus: {
    level2: { evolutions1: number; evolutions2: number };
    level4: { evolutions1: number; evolutions2: number };
  };
  carrySizeBonus: {
    1?: number;
    2?: number;
    3?: number;
    4?: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    [level: number]: number | undefined;
    [key: string]: number | undefined;
  };
}

export interface GameConstants {
  TASTY_CHANCE_S_CAP: number;
  MAX_RECIPE_LEVEL: number;
  MAX_INGREDIENT_INVENTORY: number;
  MAX_POKEMON_LEVEL: number;
  MAX_RIBBON_LEVEL: number;
  MAX_STOCKPILED_BERRIES: number;
  MIN_POT_SIZE: number;
  MAX_POT_SIZE: number;
  POT_GROWTH_LOW: number;
  POT_GROWTH_HIGH: number;
  POT_GROWTH_THRESHOLD: number;
  MEALS_IN_DAY: number;
  WEEKDAY_CRIT_CHANCE: number;
  WEEKDAY_CRIT_MULTIPLIER: number;
  SUNDAY_CRIT_CHANCE: number;
  SUNDAY_CRIT_MULTIPLIER: number;
  AVERAGE_WEEKLY_CRIT_MULTIPLIER: number;
  MAX_ISLAND_BONUS: number;
  BASE_FAVORED_BERRY_MULTIPLIER: number;
  MAX_TEAM_SIZE: number;
  MAX_ENERGY_RECOVERY: number;
  MAX_ENERGY_RECOVERY_ERB: number;
  ribbonRules: RibbonRules;
  [key: string]: unknown;
}

export interface Probabilities {
  subskills: {
    rarity_distribution: {
      gold: number;
      silver: number;
      white: number;
    };
    pity: {
      fifth_white_to_gold: boolean;
      friendship_level_thresholds: Array<{
        min_level: number;
        guaranteed_gold_slots: number;
      }>;
    };
  };
  ingredients: {
    unlock_levels: {
      slot_0: number;
      slot_30: number;
      slot_60: number;
    };
    combo_3_ingredients: Record<string, number>;
    combo_2_ingredients: Record<string, number>;
    combo_1_ingredient: Record<string, number>;
  };
  natures: {
    distribution: string;
    single_probability: number;
  };
  [key: string]: unknown;
}

export interface LevelCurve {
  candy_exp: {
    brackets: Array<{
      min_level: number;
      max_level: number;
      exp_per_candy: number;
    }>;
  };
  species_exp_multipliers: {
    standard: number;
    pseudo_legendary: number;
    legendary: number;
  };
  dream_shards_per_candy: Record<number, number>;
}

export interface GameData {
  metadata: Metadata;
  pokemon: PokemonSpecies[];
  berries: Berry[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipeLevelBonus: Record<number, number>;
  natures: Nature[];
  subskills: Subskill[];
  islands: Island[];
  constants: GameConstants;
  probabilities: Probabilities;
  levelCurve: LevelCurve;
}

export interface LanguagePack {
  lang: Locale;
  terms: {
    specialty: Record<Specialty, string>;
    recipe_types: Record<RecipeType, string>;
    pokemon_types?: Record<string, string>;
  };
  pokemon: Record<string, string>;
  berries: Record<string, string>;
  ingredients: Record<string, string>;
  recipes: Record<string, string>;
  natures: Record<string, string>;
  subskills: Record<string, string>;
  islands: Record<string, string>;
  mainskills: Record<string, string>;
  aliases: Record<string, { type: string; key: string }>;
}
