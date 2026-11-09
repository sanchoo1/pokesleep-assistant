/**
 * Resource Investment & Cultivation Simulator for Pokémon Sleep
 * Supports Main Skill Seeds (金瓜子), Sub Skill Seeds (银瓜子), and Nature Mints (薄荷)
 */

export interface SilverSeedUpgradeStep {
  slotKey: string;
  fromSkill: string;
  toSkill: string;
}

export interface ResourceInvestmentOptions {
  goldSeeds: number;
  silverSeeds: number;
  useMint: boolean;
  mintNature?: string;
}

export interface ResourceSimulationConfig {
  speciesSpecialty: string;
  rawNature: string;
  rawMainSkillLevel: number;
  maxSkillLevel: number;
  rawSubskills: Record<string, string>;
}

export interface AppliedResourceInvestment {
  effectiveNature: string;
  effectiveMainSkillLevel: number;
  effectiveSubskills: Record<string, string>;
  appliedGoldSeeds: number;
  appliedSilverSeeds: number;
  appliedMint: boolean;
  mintNature?: string;
  appliedSilverSteps: SilverSeedUpgradeStep[];
  maxGold: number;
  maxSilver: number;
  allAvailableSteps: SilverSeedUpgradeStep[];
  isInvested: boolean;
}

export const SUB_SKILL_UPGRADE_MAP: Record<string, string> = {
  'Helping Speed S': 'Helping Speed M',
  'Skill Trigger S': 'Skill Trigger M',
  'Ingredient Finder S': 'Ingredient Finder M',
  'Inventory Up S': 'Inventory Up M',
  'Inventory Up M': 'Inventory Up L',
  'Skill Level Up S': 'Skill Level Up M',
};

/**
 * Returns recommended competitive nature for a specialty
 */
export function getRecommendedMintNature(specialty: string): string {
  switch (specialty) {
    case 'berry':
      return 'Adamant'; // 固执 (+Speed, -Ingredient)
    case 'skill':
      return 'Careful'; // 慎重 (+Skill, -Ingredient)
    case 'ingredient':
      return 'Quiet'; // 冷静 (+Ingredient, -EXP)
    default:
      return 'Adamant';
  }
}

/**
 * Computes all ordered silver seed upgrade steps possible on the given subskills.
 * Respects uniqueness (cannot upgrade to a subskill already present on the Pokémon)
 * and prioritizes upgrades according to the Pokémon's specialty.
 */
export function getAvailableSilverSeedUpgrades(
  subskills: Record<string, string>,
  specialty: string = 'berry'
): SilverSeedUpgradeStep[] {
  const priorityOrder =
    specialty === 'skill'
      ? [
          'Skill Trigger S',
          'Helping Speed S',
          'Inventory Up S',
          'Inventory Up M',
          'Skill Level Up S',
          'Ingredient Finder S',
        ]
      : specialty === 'ingredient'
      ? [
          'Ingredient Finder S',
          'Inventory Up S',
          'Inventory Up M',
          'Helping Speed S',
          'Skill Trigger S',
          'Skill Level Up S',
        ]
      : [
          'Helping Speed S',
          'Skill Trigger S',
          'Inventory Up S',
          'Inventory Up M',
          'Skill Level Up S',
          'Ingredient Finder S',
        ];

  const slots = { ...subskills };
  const steps: SilverSeedUpgradeStep[] = [];

  while (true) {
    const presentSkills = new Set(Object.values(slots).filter(Boolean));
    const candidates: Array<{
      slotKey: string;
      fromSkill: string;
      toSkill: string;
      priority: number;
    }> = [];

    for (const [slotKey, skillName] of Object.entries(slots)) {
      if (!skillName) continue;
      const nextTier = SUB_SKILL_UPGRADE_MAP[skillName];
      if (nextTier && !presentSkills.has(nextTier)) {
        const priorityIndex = priorityOrder.indexOf(skillName);
        candidates.push({
          slotKey,
          fromSkill: skillName,
          toSkill: nextTier,
          priority: priorityIndex !== -1 ? priorityIndex : 99,
        });
      }
    }

    if (candidates.length === 0) break;

    // Pick candidate with highest priority (lowest index)
    candidates.sort((a, b) => a.priority - b.priority);
    const chosen = candidates[0];
    steps.push({
      slotKey: chosen.slotKey,
      fromSkill: chosen.fromSkill,
      toSkill: chosen.toSkill,
    });
    slots[chosen.slotKey] = chosen.toSkill;
  }

  return steps;
}

/**
 * Applies gold seeds, silver seeds, and mint to compute the effective Pokémon configuration.
 */
export function applyResourceInvestment(
  config: ResourceSimulationConfig,
  options: ResourceInvestmentOptions
): AppliedResourceInvestment {
  const maxGold = Math.max(0, config.maxSkillLevel - config.rawMainSkillLevel);
  const appliedGoldSeeds = Math.min(Math.max(0, options.goldSeeds || 0), maxGold);
  const effectiveMainSkillLevel = config.rawMainSkillLevel + appliedGoldSeeds;

  const allAvailableSteps = getAvailableSilverSeedUpgrades(
    config.rawSubskills,
    config.speciesSpecialty
  );

  const appliedSilverSeeds = Math.min(
    Math.max(0, options.silverSeeds || 0),
    allAvailableSteps.length
  );
  const appliedSilverSteps = allAvailableSteps.slice(0, appliedSilverSeeds);

  const effectiveSubskills = { ...config.rawSubskills };
  for (const step of appliedSilverSteps) {
    effectiveSubskills[step.slotKey] = step.toSkill;
  }

  const appliedMint = Boolean(
    options.useMint && options.mintNature && options.mintNature !== config.rawNature
  );
  const effectiveNature = appliedMint && options.mintNature ? options.mintNature : config.rawNature;

  const isInvested = appliedGoldSeeds > 0 || appliedSilverSeeds > 0 || appliedMint;

  return {
    effectiveNature,
    effectiveMainSkillLevel,
    effectiveSubskills,
    appliedGoldSeeds,
    appliedSilverSeeds,
    appliedMint,
    mintNature: options.mintNature,
    appliedSilverSteps,
    maxGold,
    maxSilver: allAvailableSteps.length,
    allAvailableSteps,
    isInvested,
  };
}
