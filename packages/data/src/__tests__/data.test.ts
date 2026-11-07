import { describe, it, expect } from 'vitest';
import {
  getGameData,
  getLanguagePack,
  getPokemonByName,
  getPokemonByDex,
  getPokemonList,
  getBerryByName,
  getIngredientByName,
  getRecipeByName,
  getNatureByName,
  getSubskillByName,
  getIslandByName,
  fuzzySearch,
} from '../index';

describe('Pokémon Sleep GameData Layer (@pokesleep/data)', () => {
  const data = getGameData();

  describe('Entity Counts and Metadata', () => {
    it('should have valid metadata and attribution', () => {
      expect(data.metadata).toBeDefined();
      expect(data.metadata.version).toBe('1.0.0');
      expect(data.metadata.attribution.nerolisLab).toContain('Apache License 2.0');
      expect(data.metadata.attribution.pokeapi).toContain('BSD 3-Clause');
      expect(data.metadata.attribution.raenonxAndMathcord).toBeDefined();
    });

    it('should contain complete entity counts matching upstream specs', () => {
      expect(data.pokemon.length).toBe(251);
      expect(data.berries.length).toBe(18);
      expect(data.ingredients.length).toBe(19);
      expect(data.recipes.length).toBe(78);
      expect(data.natures.length).toBe(25);
      expect(data.subskills.length).toBe(17);
      expect(data.islands.length).toBe(7);
      expect(Object.keys(data.recipeLevelBonus).length).toBe(70);
    });

    it('should include accurate constants and ribbon rules', () => {
      expect(data.constants.MAX_POKEMON_LEVEL).toBe(70);
      expect(data.constants.MAX_RECIPE_LEVEL).toBe(70);
      expect(data.constants.MIN_POT_SIZE).toBe(21);
      expect(data.constants.MAX_POT_SIZE).toBe(81);
      expect(data.constants.ribbonRules.carrySizeBonus[4]).toBe(8);
      expect(data.constants.ribbonRules.frequencyBonus.level2.evolutions2).toBe(0.11);
    });

    it('should include probability config and level curves', () => {
      expect(data.probabilities.subskills.rarity_distribution.gold).toBe(0.14);
      expect(data.probabilities.subskills.rarity_distribution.silver).toBe(0.33);
      expect(data.probabilities.subskills.rarity_distribution.white).toBe(0.53);
      expect(data.probabilities.subskills.pity.fifth_white_to_gold).toBe(true);
      expect(data.probabilities.ingredients.combo_3_ingredients.AAA).toBeCloseTo(1 / 9);

      expect(data.levelCurve.candy_exp.brackets.length).toBe(3);
      expect(data.levelCurve.dream_shards_per_candy[1]).toBe(14);
      expect(data.levelCurve.dream_shards_per_candy[70]).toBe(1382);
    });
  });

  describe('Multilingual Integrity across all 4 locales', () => {
    it('should have complete translations for every Pokemon', () => {
      for (const mon of data.pokemon) {
        expect(mon.translations['zh-CN']).toBeTruthy();
        expect(mon.translations['zh-TW']).toBeTruthy();
        expect(mon.translations.ja).toBeTruthy();
        expect(mon.translations.en).toBeTruthy();
      }
    });

    it('should have complete translations for all berries, ingredients, and recipes', () => {
      for (const b of data.berries) {
        expect(b.translations['zh-CN']).toBeTruthy();
        expect(b.translations['zh-TW']).toBeTruthy();
        expect(b.translations.ja).toBeTruthy();
        expect(b.translations.en).toBeTruthy();
      }
      for (const ing of data.ingredients) {
        expect(ing.translations['zh-CN']).toBeTruthy();
        expect(ing.translations['zh-TW']).toBeTruthy();
        expect(ing.translations.ja).toBeTruthy();
        expect(ing.translations.en).toBeTruthy();
      }
      for (const r of data.recipes) {
        expect(r.translations['zh-CN']).toBeTruthy();
        expect(r.translations['zh-TW']).toBeTruthy();
        expect(r.translations.ja).toBeTruthy();
        expect(r.translations.en).toBeTruthy();
      }
    });

    it('should load all language packs properly', () => {
      const zhCN = getLanguagePack('zh-CN');
      const zhTW = getLanguagePack('zh-TW');
      const ja = getLanguagePack('ja');
      const en = getLanguagePack('en');

      expect(zhCN.lang).toBe('zh-CN');
      expect(zhCN.pokemon.PIKACHU).toBe('皮卡丘');
      expect(zhTW.pokemon.PIKACHU).toBe('皮卡丘');
      expect(ja.pokemon.PIKACHU).toBe('ピカチュウ');
      expect(en.pokemon.PIKACHU).toBe('Pikachu');

      expect(zhCN.ingredients.Apple).toBe('特选苹果');
      expect(zhTW.ingredients.Apple).toBe('特選蘋果');
      expect(ja.ingredients.Apple).toBe('とくせんリンゴ');
      expect(en.ingredients.Apple).toBe('Fancy Apple');
    });
  });

  describe('Lookup Functions', () => {
    it('should resolve Pokémon by ID, internal name, display name, and translations', () => {
      const pika = getPokemonByName('PIKACHU');
      expect(pika).toBeDefined();
      expect(pika?.pokedexNumber).toBe(25);
      expect(pika?.specialty).toBe('berry');

      expect(getPokemonByName('Pikachu')?.name).toBe('PIKACHU');
      expect(getPokemonByName('皮卡丘')?.name).toBe('PIKACHU');
      expect(getPokemonByName('ピカチュウ')?.name).toBe('PIKACHU');
      expect(getPokemonByDex(25)?.name).toBe('PIKACHU');

      const bulba = getPokemonByName('妙蛙种子');
      expect(bulba?.pokedexNumber).toBe(1);
    });

    it('should resolve ingredients by name, longName, and aliases', () => {
      const ing = getIngredientByName('Apple');
      expect(ing).toBeDefined();
      expect(ing?.value).toBe(90);

      expect(getIngredientByName('Fancy Apple')?.name).toBe('Apple');
      expect(getIngredientByName('特选苹果')?.name).toBe('Apple');
      expect(getIngredientByName('苹果')?.name).toBe('Apple');
      expect(getIngredientByName('美味尾巴')?.name).toBe('Tail');
      expect(getIngredientByName('纯粹油')?.name).toBe('Oil');
    });

    it('should resolve subskills by name, shortName, and aliases', () => {
      const bfs = getSubskillByName('Berry Finding S');
      expect(bfs).toBeDefined();
      expect(bfs?.rarity).toBe('gold');

      expect(getSubskillByName('BFS')?.name).toBe('Berry Finding S');
      expect(getSubskillByName('树果数量S')?.name).toBe('Berry Finding S');
      expect(getSubskillByName('树果S')?.name).toBe('Berry Finding S');

      expect(getSubskillByName('HB')?.name).toBe('Helping Bonus');
      expect(getSubskillByName('帮手奖励')?.name).toBe('Helping Bonus');
      expect(getSubskillByName('帮奖')?.name).toBe('Helping Bonus');
    });

    it('should resolve natures by English and localized names', () => {
      const adamant = getNatureByName('Adamant');
      expect(adamant).toBeDefined();
      expect(adamant?.positiveModifier).toBe('speed');
      expect(adamant?.negativeModifier).toBe('ingredient');

      expect(getNatureByName('固执')?.name).toBe('Adamant');
      expect(getNatureByName('いじっぱり')?.name).toBe('Adamant');
      expect(getNatureByName('内敛')?.name).toBe('Modest');
    });

    it('should resolve berries and recipes', () => {
      expect(getBerryByName('GREPA')?.name).toBe('GREPA');
      expect(getBerryByName('萄葡果')?.name).toBe('GREPA');

      expect(getRecipeByName('FANCY_APPLE_CURRY')?.type).toBe('curry');
      expect(getRecipeByName('特选苹果咖喱')?.name).toBe('FANCY_APPLE_CURRY');
      expect(getRecipeByName('经典汽水')?.name).toBe('CRAFT_SODA_POP');
    });

    it('should resolve islands', () => {
      expect(getIslandByName('greengrass')?.name).toBe('Greengrass Isle');
      expect(getIslandByName('萌绿之岛')?.shortName).toBe('greengrass');
      expect(getIslandByName('cyan')?.berries).toContain('ORAN');
    });
  });

  describe('Fuzzy Search and OCR Typo Tolerance', () => {
    it('should fuzzy find Pokémon even with minor typos or abbreviations', () => {
      const res1 = fuzzySearch('皮卡');
      expect(res1.length).toBeGreaterThan(0);
      expect((res1[0].item as { name: string }).name).toBe('PIKACHU');

      // OCR typo test: "皮卡秋" instead of "皮卡丘"
      const res2 = fuzzySearch('皮卡秋', { categories: ['pokemon'] });
      expect(res2.length).toBeGreaterThan(0);
      expect((res2[0].item as { name: string }).name).toBe('PIKACHU');
    });

    it('should fuzzy resolve subskills from OCR-like short names or partial text', () => {
      const resBfs = fuzzySearch('树果数量', { categories: ['subskill'] });
      expect(resBfs.length).toBeGreaterThan(0);
      expect((resBfs[0].item as { name: string }).name).toBe('Berry Finding S');

      const resHb = fuzzySearch('帮奖', { categories: ['subskill'] });
      expect(resHb.length).toBeGreaterThan(0);
      expect((resHb[0].item as { name: string }).name).toBe('Helping Bonus');
    });

    it('should fuzzy resolve ingredients', () => {
      const resIng = fuzzySearch('生姜', { categories: ['ingredient'] });
      expect(resIng.length).toBeGreaterThan(0);
      expect((resIng[0].item as { name: string }).name).toBe('Ginger');
    });
  });
});
