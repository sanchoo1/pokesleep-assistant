import type {
  GameData,
  Locale,
  PokemonSpecies,
  Berry,
  Ingredient,
  Recipe,
  Nature,
  Subskill,
  Island,
  LanguagePack,
} from './types';

// Import raw JSON generated data
import gameDataRaw from './generated/game-data.json';
import zhCNPackRaw from './generated/locales/zh-CN.json';
import zhTWPackRaw from './generated/locales/zh-TW.json';
import jaPackRaw from './generated/locales/ja.json';
import enPackRaw from './generated/locales/en.json';

export * from './types';

export const GAME_DATA = gameDataRaw as unknown as GameData;

const LANGUAGE_PACKS: Record<Locale, LanguagePack> = {
  'zh-CN': zhCNPackRaw as unknown as LanguagePack,
  'zh-TW': zhTWPackRaw as unknown as LanguagePack,
  ja: jaPackRaw as unknown as LanguagePack,
  en: enPackRaw as unknown as LanguagePack,
};

// Indexing for fast O(1) queries
const pokemonByName = new Map<string, PokemonSpecies>();
const pokemonByDex = new Map<number, PokemonSpecies>();
const pokemonByLocalizedName = new Map<string, PokemonSpecies>();

for (const mon of GAME_DATA.pokemon) {
  pokemonByName.set(mon.name.toUpperCase(), mon);
  pokemonByName.set(mon.displayName.toLowerCase(), mon);
  if (!pokemonByDex.has(mon.pokedexNumber)) {
    pokemonByDex.set(mon.pokedexNumber, mon);
  }
  for (const trans of Object.values(mon.translations)) {
    if (typeof trans === 'string') {
      pokemonByLocalizedName.set(trans.toLowerCase(), mon);
    }
  }
}

const berriesByName = new Map<string, Berry>();
for (const b of GAME_DATA.berries) {
  berriesByName.set(b.name.toUpperCase(), b);
  for (const trans of Object.values(b.translations)) {
    if (typeof trans === 'string') {
      berriesByName.set(trans.toLowerCase(), b);
    }
  }
}

const ingredientsByName = new Map<string, Ingredient>();
for (const ing of GAME_DATA.ingredients) {
  ingredientsByName.set(ing.name.toLowerCase(), ing);
  ingredientsByName.set(ing.longName.toLowerCase(), ing);
  for (const trans of Object.values(ing.translations)) {
    if (typeof trans === 'string') {
      ingredientsByName.set(trans.toLowerCase(), ing);
    }
  }
  if (ing.aliases) {
    for (const al of ing.aliases) {
      ingredientsByName.set(al.toLowerCase(), ing);
    }
  }
}

const recipesByName = new Map<string, Recipe>();
for (const r of GAME_DATA.recipes) {
  recipesByName.set(r.name.toUpperCase(), r);
  recipesByName.set(r.displayName.toLowerCase(), r);
  for (const trans of Object.values(r.translations)) {
    if (typeof trans === 'string') {
      recipesByName.set(trans.toLowerCase(), r);
    }
  }
  if (r.aliases) {
    for (const al of r.aliases) {
      recipesByName.set(al.toLowerCase(), r);
    }
  }
}

const naturesByName = new Map<string, Nature>();
for (const n of GAME_DATA.natures) {
  naturesByName.set(n.name.toLowerCase(), n);
  for (const trans of Object.values(n.translations)) {
    if (typeof trans === 'string') {
      naturesByName.set(trans.toLowerCase(), n);
    }
  }
}

const subskillsByName = new Map<string, Subskill>();
for (const s of GAME_DATA.subskills) {
  subskillsByName.set(s.name.toLowerCase(), s);
  subskillsByName.set(s.shortName.toLowerCase(), s);
  for (const trans of Object.values(s.translations)) {
    if (typeof trans === 'string') {
      subskillsByName.set(trans.toLowerCase(), s);
    }
  }
  if (s.aliases) {
    for (const al of s.aliases) {
      subskillsByName.set(al.toLowerCase(), s);
    }
  }
}

const islandsByName = new Map<string, Island>();
for (const isle of GAME_DATA.islands) {
  islandsByName.set(isle.name.toLowerCase(), isle);
  islandsByName.set(isle.shortName.toLowerCase(), isle);
  for (const trans of Object.values(isle.translations)) {
    if (typeof trans === 'string') {
      islandsByName.set(trans.toLowerCase(), isle);
    }
  }
  if (isle.aliases) {
    for (const al of isle.aliases) {
      islandsByName.set(al.toLowerCase(), isle);
    }
  }
}

/**
 * Access the complete GameData bundle.
 */
export function getGameData(): GameData {
  return GAME_DATA;
}

/**
 * Access a specific language pack.
 */
export function getLanguagePack(locale: Locale = 'zh-CN'): LanguagePack {
  return LANGUAGE_PACKS[locale] || LANGUAGE_PACKS['zh-CN'];
}

/**
 * Get all available Pokémon species.
 */
export function getPokemonList(): PokemonSpecies[] {
  return GAME_DATA.pokemon;
}

/**
 * Find Pokémon by internal name (e.g. "PIKACHU"), displayName ("Pikachu"), or localized translation.
 */
export function getPokemonByName(name: string): PokemonSpecies | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();
  return (
    pokemonByName.get(clean.toUpperCase()) ||
    pokemonByName.get(clean) ||
    pokemonByLocalizedName.get(clean)
  );
}

/**
 * Find default/first Pokémon by Pokédex number.
 */
export function getPokemonByDex(dexNumber: number): PokemonSpecies | undefined {
  return pokemonByDex.get(dexNumber);
}

/**
 * Find Berry by identifier or localized name.
 */
export function getBerryByName(name: string): Berry | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();
  return berriesByName.get(clean.toUpperCase()) || berriesByName.get(clean);
}

/**
 * Find Ingredient by identifier (e.g. "Apple"), longName ("Fancy Apple"), alias, or localized name.
 */
export function getIngredientByName(name: string): Ingredient | undefined {
  if (!name) return undefined;
  return ingredientsByName.get(name.trim().toLowerCase());
}

/**
 * Find Recipe by internal key (e.g. "FANCY_APPLE_CURRY"), displayName, or localized name.
 */
export function getRecipeByName(name: string): Recipe | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();
  return recipesByName.get(clean.toUpperCase()) || recipesByName.get(clean);
}

/**
 * Find Nature by English name (e.g. "Adamant") or localized translation (e.g. "固执").
 */
export function getNatureByName(name: string): Nature | undefined {
  if (!name) return undefined;
  return naturesByName.get(name.trim().toLowerCase());
}

/**
 * Find Subskill by name, shortName ("BFS", "HB"), alias, or localized name.
 */
export function getSubskillByName(name: string): Subskill | undefined {
  if (!name) return undefined;
  return subskillsByName.get(name.trim().toLowerCase());
}

/**
 * Find Island by shortName (e.g. "greengrass"), name, or localized name.
 */
export function getIslandByName(name: string): Island | undefined {
  if (!name) return undefined;
  return islandsByName.get(name.trim().toLowerCase());
}

// -------------------------------------------------------------
// Fuzzy Search & OCR Error-Tolerant Resolution
// -------------------------------------------------------------

export interface FuzzySearchResult<T> {
  item: T;
  type: 'pokemon' | 'subskill' | 'ingredient' | 'nature' | 'berry' | 'recipe' | 'island';
  matchedText: string;
  score: number; // 0 (no match) to 1 (exact match)
}

export interface FuzzySearchOptions {
  categories?: Array<'pokemon' | 'subskill' | 'ingredient' | 'nature' | 'berry' | 'recipe' | 'island'>;
  locale?: Locale;
  limit?: number;
  minScore?: number;
}

/**
 * Calculate Levenshtein similarity (1 - normalized distance)
 */
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  // Substring or prefix quick boost
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(len1, len2);
    return Math.max(0.7, minLen / maxLen);
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Fuzzy search across Pokémon, Subskills, Ingredients, Natures, Berries, Recipes, and Islands.
 * Designed specifically for UI search bars and OCR post-processing correction.
 */
export function fuzzySearch(
  query: string,
  options: FuzzySearchOptions = {}
): FuzzySearchResult<unknown>[] {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const {
    categories = ['pokemon', 'subskill', 'ingredient', 'nature', 'berry', 'recipe', 'island'],
    locale = 'zh-CN',
    limit = 10,
    minScore = 0.4,
  } = options;

  const results: FuzzySearchResult<unknown>[] = [];

  function testCandidate(item: unknown, type: FuzzySearchResult<unknown>['type'], candidateStrings: string[]) {
    let bestScore = 0;
    let bestMatch = '';
    for (const str of candidateStrings) {
      if (!str) continue;
      const lower = str.toLowerCase();
      if (lower === q) {
        bestScore = 1.0;
        bestMatch = str;
        break;
      }
      const sim = stringSimilarity(lower, q);
      if (sim > bestScore) {
        bestScore = sim;
        bestMatch = str;
      }
    }
    if (bestScore >= minScore) {
      results.push({ item, type, matchedText: bestMatch, score: bestScore });
    }
  }

  // 1. Pokémon
  if (categories.includes('pokemon')) {
    for (const mon of GAME_DATA.pokemon) {
      testCandidate(mon, 'pokemon', [
        mon.name,
        mon.displayName,
        mon.translations['zh-CN'],
        mon.translations['zh-TW'],
        mon.translations.ja,
        mon.translations.en,
      ]);
    }
  }

  // 2. Subskills
  if (categories.includes('subskill')) {
    for (const s of GAME_DATA.subskills) {
      const candidates = [
        s.name,
        s.shortName,
        s.translations['zh-CN'],
        s.translations['zh-TW'],
        s.translations.ja,
        s.translations.en,
        ...(s.aliases || []),
      ];
      testCandidate(s, 'subskill', candidates);
    }
  }

  // 3. Ingredients
  if (categories.includes('ingredient')) {
    for (const ing of GAME_DATA.ingredients) {
      const candidates = [
        ing.name,
        ing.longName,
        ing.translations['zh-CN'],
        ing.translations['zh-TW'],
        ing.translations.ja,
        ing.translations.en,
        ...(ing.aliases || []),
      ];
      testCandidate(ing, 'ingredient', candidates);
    }
  }

  // 4. Natures
  if (categories.includes('nature')) {
    for (const n of GAME_DATA.natures) {
      const candidates = [
        n.name,
        n.translations['zh-CN'],
        n.translations['zh-TW'],
        n.translations.ja,
        n.translations.en,
      ];
      testCandidate(n, 'nature', candidates);
    }
  }

  // 5. Berries
  if (categories.includes('berry')) {
    for (const b of GAME_DATA.berries) {
      const candidates = [
        b.name,
        b.translations['zh-CN'],
        b.translations['zh-TW'],
        b.translations.ja,
        b.translations.en,
      ];
      testCandidate(b, 'berry', candidates);
    }
  }

  // 6. Recipes
  if (categories.includes('recipe')) {
    for (const r of GAME_DATA.recipes) {
      const candidates = [
        r.name,
        r.displayName,
        r.translations['zh-CN'],
        r.translations['zh-TW'],
        r.translations.ja,
        r.translations.en,
      ];
      testCandidate(r, 'recipe', candidates);
    }
  }

  // 7. Islands
  if (categories.includes('island')) {
    for (const isle of GAME_DATA.islands) {
      const candidates = [
        isle.name,
        isle.shortName,
        isle.translations['zh-CN'],
        isle.translations['zh-TW'],
        isle.translations.ja,
        isle.translations.en,
        ...(isle.aliases || []),
      ];
      testCandidate(isle, 'island', candidates);
    }
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
