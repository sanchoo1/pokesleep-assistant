import { COMPLETE_POKEDEX } from '../../.cache/nerolis-lab/common/src/types/pokemon/pokedex';
import { BERRIES } from '../../.cache/nerolis-lab/common/src/types/berry/berries';
import { INGREDIENTS } from '../../.cache/nerolis-lab/common/src/types/ingredient/ingredients';
import * as recipesModule from '../../.cache/nerolis-lab/common/src/types/recipe/index';
import { recipeLevelBonus } from '../../.cache/nerolis-lab/common/src/utils/recipe-utils/recipe-utils';
import { NATURES } from '../../.cache/nerolis-lab/common/src/types/nature/nature';
import { SUBSKILLS } from '../../.cache/nerolis-lab/common/src/types/subskill/subskills';
import { ISLANDS } from '../../.cache/nerolis-lab/common/src/types/island/index';
import * as constants from '../../.cache/nerolis-lab/common/src/types/constants';

export function getRawNeroliData() {
  const allRecipes = [
    ...recipesModule.curry.CURRIES,
    ...recipesModule.salad.SALADS,
    ...recipesModule.dessert.DESSERTS,
  ];

  return {
    pokemon: COMPLETE_POKEDEX,
    berries: BERRIES,
    ingredients: INGREDIENTS,
    recipes: allRecipes,
    recipeLevelBonus,
    natures: NATURES,
    subskills: SUBSKILLS,
    islands: ISLANDS,
    constants,
  };
}
