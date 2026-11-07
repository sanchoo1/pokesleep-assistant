import React, { useMemo } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getPokemonImageUrl,
  getTypeImageUrl,
  getBerryImageUrl,
  getIngredientImageUrl,
  getSkillImageUrl,
} from '@pokesleep/data';
import { calculateDailyProduction } from '@pokesleep/engine';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getNatureModLabel, getPokemonTypeLabel, getUIText } from '../i18n';
import { Trash2, Sparkles, Plus, Check, Pencil, Lock, Tent } from 'lucide-react';

interface PokemonCardProps {
  pokemon: BoxPokemon;
  locale: SupportedLocale;
  onDelete: (id: string) => void;
  onEdit: (pokemon: BoxPokemon) => void;
  onAnalyze: (pokemon: BoxPokemon) => void;
  isInTeam?: boolean;
  onToggleTeam?: (pokemon: BoxPokemon) => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({
  pokemon,
  locale,
  onDelete,
  onEdit,
  onAnalyze,
  isInTeam,
  onToggleTeam,
}) => {
  const species = useMemo(() => {
    return (
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === pokemon.pokemonName.toUpperCase()
      ) || GAME_DATA.pokemon[0]
    );
  }, [pokemon.pokemonName]);

  const berryObj = useMemo(() => {
    return GAME_DATA.berries.find(
      (b) => b.name.toUpperCase() === species.berry.toUpperCase()
    );
  }, [species]);

  const nature = useMemo(() => {
    return GAME_DATA.natures.find(
      (n) => n.name.toLowerCase() === pokemon.nature.toLowerCase()
    );
  }, [pokemon.nature]);

  const normSubs = useMemo(() => normalizeBoxSubskills(pokemon.subskills), [pokemon.subskills]);

  const production = useMemo(() => {
    try {
      return calculateDailyProduction({
        pokemon: pokemon.pokemonName,
        level: pokemon.level,
        nature: pokemon.nature,
        subskills: normSubs,
        ingredientSelection: {
          slot0: pokemon.ingredients.slotA,
          slot30: pokemon.ingredients.slotB,
          slot60: pokemon.ingredients.slotC,
        },
        mainSkillLevel: pokemon.mainSkillLevel || 1 + (species.previousEvolutions || 0),
        ribbonLevel: pokemon.ribbonLevel || 0,
      });
    } catch {
      return null;
    }
  }, [pokemon, normSubs, species]);

  const specialtyBadgeClass =
    (
      {
        berry: 'badge-berry',
        ingredient: 'badge-ingredient',
        skill: 'badge-skill',
        all: 'badge-white',
      } as Record<string, string>
    )[species.specialty] || 'badge-white';

  const specialtyLabel =
    (
      {
        berry: getUIText('filterBerry', locale),
        ingredient: getUIText('filterIngredient', locale),
        skill: getUIText('filterSkill', locale),
        all: '全能',
      } as Record<string, string>
    )[species.specialty] || species.specialty;

  const speciesName = getEntityName(species, locale);

  return (
    <div
      className={`card p-4 relative flex flex-col justify-between select-none ${
        isInTeam ? 'ring-2 ring-[var(--primary)]/35 bg-[#fbfbf9]' : ''
      }`}
    >
      <div>
        {/* Top Header Row: Sprite, Info, Actions */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {/* Pokemon Sprite with soft ambient glow */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-[#f7f5ee] flex items-center justify-center p-1 border border-[#eae4d6]/60">
                <img
                  src={getPokemonImageUrl(species.name)}
                  alt={species.displayName}
                  className="w-12 h-12 object-contain"
                  loading="lazy"
                />
              </div>
              {species.type && (
                <img
                  src={getTypeImageUrl(species.type)}
                  alt={species.type}
                  title={getPokemonTypeLabel(species.type, locale)}
                  className="w-4 h-4 object-contain absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-xs border border-[#eae4d6]"
                />
              )}
            </div>

            {/* Name, Nickname & Meta Badges */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline space-x-1.5 min-w-0">
                <h3
                  className="font-bold text-base text-[var(--text-main)] truncate tracking-tight"
                  title={speciesName}
                >
                  {speciesName}
                </h3>
                {pokemon.nickname && (
                  <span
                    className="text-xs text-[var(--text-muted)] truncate max-w-[100px]"
                    title={pokemon.nickname}
                  >
                    ({pokemon.nickname})
                  </span>
                )}
              </div>

              {/* Status Pills */}
              <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-y-1">
                <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
                  Lv.{pokemon.level}
                </span>
                {production && (
                  <span className="text-2xs font-medium px-1.5 py-0.5 rounded-md bg-[#f2ede4] text-[#5e5445]">
                    SP {production.rp.toLocaleString()}
                  </span>
                )}
                <span className={`badge ${specialtyBadgeClass} text-2xs`}>
                  {specialtyLabel}
                </span>
                {isInTeam && (
                  <span className="inline-flex items-center text-2xs font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                    <Tent className="w-3 h-3 mr-0.5" />
                    已出阵
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Bar with Apple-style micro-interactions */}
          <div className="flex items-center space-x-0.5 shrink-0">
            {onToggleTeam && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTeam(pokemon);
                }}
                title={isInTeam ? '从出阵队伍移出' : '加入出阵队伍'}
                className={`w-7 h-7 rounded-lg flex items-center justify-center tap-feedback cursor-pointer transition-colors ${
                  isInTeam
                    ? 'bg-[var(--primary)] text-white shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[#f4efe6]'
                }`}
              >
                {isInTeam ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAnalyze(pokemon)}
              title="多阶段个体分析 (PR 评估)"
              className="w-7 h-7 rounded-lg flex items-center justify-center tap-feedback text-amber-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(pokemon)}
              title="编辑宝可梦卡片"
              className="w-7 h-7 rounded-lg flex items-center justify-center tap-feedback text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[#f4efe6] cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(pokemon.id)}
              title="删除卡片"
              className="w-7 h-7 rounded-lg flex items-center justify-center tap-feedback text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Integrated Berry & Main Skill Section (De-boxed) */}
        <div className="mt-3 flex items-center justify-between text-2xs text-[var(--text-muted)] bg-[#f7f5ee] px-2.5 py-1.5 rounded-xl">
          {berryObj && (
            <span className="inline-flex items-center space-x-1.5 font-medium text-[var(--text-main)]">
              <img
                src={getBerryImageUrl(berryObj.name)}
                alt={berryObj.name}
                className="w-4 h-4 object-contain"
              />
              <span>
                {getEntityName(berryObj, locale)} ×{production?.berriesPerDrop || 1}
              </span>
            </span>
          )}
          <span className="inline-flex items-center space-x-1.5 font-medium text-[var(--skill-text)] truncate ml-2">
            <img
              src={getSkillImageUrl(species.skill.image)}
              alt=""
              className="w-4 h-4 object-contain shrink-0"
            />
            <span className="truncate">
              {species.skill.translations?.[locale] || species.skill.name} Lv.
              {production?.effectiveMainSkillLevel || pokemon.mainSkillLevel || 1}
            </span>
          </span>
        </div>

        {/* Nature Row with Gentle Modifiers */}
        <div className="mt-2 text-xs flex items-center justify-between px-2.5 py-1 rounded-lg text-[var(--text-muted)] bg-stone-50/70">
          <span className="truncate">
            {getUIText('nature', locale)}:{' '}
            <strong className="text-[var(--text-main)] font-semibold">
              {getEntityName(nature, locale)}
            </strong>
          </span>
          {nature && nature.positiveModifier && nature.positiveModifier !== 'neutral' ? (
            <span className="text-2xs inline-flex items-center space-x-1 shrink-0 ml-1">
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                ▲ {getNatureModLabel(nature.positiveModifier, locale)}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-medium">
                ▼ {getNatureModLabel(nature.negativeModifier, locale)}
              </span>
            </span>
          ) : (
            <span className="text-2xs text-[var(--text-subtle)]">无修正</span>
          )}
        </div>

        {/* Subskills: Growth Progression Timeline */}
        <div className="mt-3">
          <div className="text-2xs font-semibold text-[var(--text-muted)] mb-1 flex items-center justify-between">
            <span>{getUIText('subskills', locale)}</span>
            <span className="text-[10px] text-[var(--text-subtle)]">Lv.10 · 25 · 50 · 70 · 80</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { lvl: 10, key: 'level10' as const },
                { lvl: 25, key: 'level25' as const },
                { lvl: 50, key: 'level50' as const },
                { lvl: 70, key: 'level70' as const },
                { lvl: 80, key: 'level80' as const },
              ]
            ).map(({ lvl, key }) => {
              const name = normSubs[key];
              const subObj = GAME_DATA.subskills.find(
                (s) => s.name.toLowerCase() === name?.toLowerCase()
              );
              const isUnlocked = pokemon.level >= lvl && lvl <= 70;
              const badgeType = subObj ? `badge-${subObj.rarity}` : 'badge-white';
              const isCapLocked = lvl === 80;

              return (
                <span
                  key={key}
                  className={`badge ${badgeType} text-2xs transition-opacity ${
                    !isUnlocked ? 'opacity-40 grayscale-[25%]' : 'shadow-2xs'
                  }`}
                  title={`Lv.${lvl}${isCapLocked ? ' (当前版本上限70未开放)' : ''}: ${subObj ? getEntityName(subObj, locale) : '未设置'}`}
                >
                  {!isUnlocked && <Lock className="w-2.5 h-2.5 mr-0.5 inline-block opacity-70" />}
                  <span className="font-mono text-[10px] mr-1 opacity-80">
                    {lvl}
                  </span>
                  <span className="truncate max-w-[130px]">
                    {subObj ? getEntityName(subObj, locale) : '—'}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Ingredients: Unified Pantry Tray */}
        <div className="mt-3">
          <div className="text-2xs font-semibold text-[var(--text-muted)] mb-1">
            {getUIText('ingredients', locale)}
          </div>
          <div className="grid grid-cols-3 gap-1 bg-[#f7f5ee] p-1 rounded-xl">
            {[
              { slot: 'Lv.1', name: pokemon.ingredients.slotA, unlocked: true },
              { slot: 'Lv.30', name: pokemon.ingredients.slotB, unlocked: pokemon.level >= 30 },
              { slot: 'Lv.60', name: pokemon.ingredients.slotC, unlocked: pokemon.level >= 60 },
            ].map((ing, idx) => {
              const ingObj = GAME_DATA.ingredients.find(
                (i) => i.name.toLowerCase() === ing.name?.toLowerCase()
              );
              return (
                <div
                  key={idx}
                  className={`px-1.5 py-1 rounded-lg text-2xs flex items-center justify-center space-x-1 transition-all ${
                    ing.unlocked
                      ? 'bg-white text-[var(--ingredient-text)] shadow-2xs font-medium'
                      : 'text-[var(--text-subtle)] bg-transparent opacity-60'
                  }`}
                >
                  {ingObj ? (
                    <img
                      src={getIngredientImageUrl(ingObj.name)}
                      alt={ingObj.name}
                      className={`w-3.5 h-3.5 object-contain shrink-0 ${!ing.unlocked ? 'opacity-40' : ''}`}
                    />
                  ) : (
                    !ing.unlocked && <Lock className="w-3 h-3 text-[var(--text-subtle)]" />
                  )}
                  <span className="truncate">
                    {ingObj ? getEntityName(ingObj, locale) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Production Footer: Energy & Daily Output */}
      {production && (
        <div className="mt-3.5 pt-2.5 border-t border-[#eae4d6] flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)] text-2xs">
            {species.specialty === 'skill'
              ? `期望触发 ${production.dailySkillProcs.toFixed(2)} 次/天`
              : species.specialty === 'ingredient'
                ? `日产食材 ${production.dailyIngredientCount.toFixed(1)} 个`
                : `持有上限 ${production.carryLimit} 个`}
          </span>
          <div className="text-right">
            <span className="font-bold text-sm text-[var(--text-main)]">
              {Math.round(production.totalDailyEnergy).toLocaleString()}{' '}
            </span>
            <span className="text-2xs font-normal text-[var(--text-muted)]">能量/天</span>
          </div>
        </div>
      )}
    </div>
  );
};
