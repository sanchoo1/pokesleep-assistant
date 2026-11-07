import { COMPLETE_POKEDEX } from '../../.cache/nerolis-lab/common/src/types/pokemon/pokedex';
import { BERRIES } from '../../.cache/nerolis-lab/common/src/types/berry/berries';
import { INGREDIENTS } from '../../.cache/nerolis-lab/common/src/types/ingredient/ingredients';
import { NATURES } from '../../.cache/nerolis-lab/common/src/types/nature/nature';
import { SUBSKILLS } from '../../.cache/nerolis-lab/common/src/types/subskill/subskills';
import { RP } from '../../.cache/nerolis-lab/common/src/utils/rp-utils/rp';
import { CarrySizeUtils } from '../../.cache/nerolis-lab/common/src/utils/carry-size-utils/carry-size-utils';
import { berryPowerForLevel } from '../../.cache/nerolis-lab/common/src/utils/berry-utils/berry-utils';
import {
  calculateIngredientPercentage,
  calculateSkillPercentage,
  calculateSkillPercentageWithPityProc,
  calculateNrOfBerriesPerDrop,
  calculateHelpSpeedSubskills,
  calculateRibbonFrequency,
} from '../../.cache/nerolis-lab/common/src/utils/stat-utils/stat-utils';
import { invertNatureFrequency } from '../../.cache/nerolis-lab/common/src/utils/nature-utils/nature-utils';
import { MathUtils } from '../../.cache/nerolis-lab/common/src/utils/math-utils/math-utils';

export function getNeroliValidationOracle() {
  return {
    COMPLETE_POKEDEX,
    BERRIES,
    INGREDIENTS,
    NATURES,
    SUBSKILLS,
    RP,
    CarrySizeUtils,
    berryPowerForLevel,
    calculateIngredientPercentage,
    calculateSkillPercentage,
    calculateSkillPercentageWithPityProc,
    calculateNrOfBerriesPerDrop,
    calculateHelpSpeedSubskills,
    calculateRibbonFrequency,
    invertNatureFrequency,
    MathUtils,
  };
}

