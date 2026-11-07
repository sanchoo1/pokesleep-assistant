import React, { useMemo } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { calculateDailyProduction } from '@pokesleep/engine';
import { BoxPokemon } from '../storage/db';
import { getEntityName, getUIText } from '../i18n';
import { Trash2, Sparkles, Plus, Check } from 'lucide-react';

interface PokemonCardProps {
  pokemon: BoxPokemon;
  locale: SupportedLocale;
  onDelete: (id: string) => void;
  onAnalyze: (pokemon: BoxPokemon) => void;
  isInTeam?: boolean;
  onToggleTeam?: (pokemon: BoxPokemon) => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({
  pokemon,
  locale,
  onDelete,
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

  const nature = useMemo(() => {
    return GAME_DATA.natures.find(
      (n) => n.name.toLowerCase() === pokemon.nature.toLowerCase()
    );
  }, [pokemon.nature]);

  // Compute L1 daily production
  const production = useMemo(() => {
    try {
      const activeSubs: string[] = [];
      const subLevels = [
        { lvl: 10, name: pokemon.subskills.level10 },
        { lvl: 25, name: pokemon.subskills.level25 },
        { lvl: 50, name: pokemon.subskills.level50 },
        { lvl: 75, name: pokemon.subskills.level75 },
        { lvl: 100, name: pokemon.subskills.level100 },
      ];
      for (const s of subLevels) {
        if (s.lvl <= pokemon.level && s.name) {
          activeSubs.push(s.name);
        }
      }

      return calculateDailyProduction({
        pokemon: pokemon.pokemonName,
        level: pokemon.level,
        nature: pokemon.nature,
        subskills: activeSubs,
        ingredientSelection: {
          slot0: pokemon.ingredients.slotA,
          slot30: pokemon.ingredients.slotB,
          slot60: pokemon.ingredients.slotC,
        },
        ribbonLevel: pokemon.ribbonLevel || 0,
      });
    } catch {
      return null;
    }
  }, [pokemon]);

  const specialtyBadgeClass = (
    {
      berry: 'badge-berry',
      ingredient: 'badge-ingredient',
      skill: 'badge-skill',
      all: 'badge-white',
    } as Record<string, string>
  )[species.specialty] || 'badge-white';

  const specialtyLabel = (
    {
      berry: getUIText('filterBerry', locale),
      ingredient: getUIText('filterIngredient', locale),
      skill: getUIText('filterSkill', locale),
      all: '全部',
    } as Record<string, string>
  )[species.specialty] || species.specialty;

  return (
    <div className={`card p-4 relative flex flex-col justify-between ${isInTeam ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''}`}>
      <div>
        {/* Top bar: Name, Level, Specialty */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base text-slate-900">
                {getEntityName(species, locale)}
              </span>
              {pokemon.nickname && (
                <span className="text-xs text-slate-500">({pokemon.nickname})</span>
              )}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                Lv.{pokemon.level}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`badge ${specialtyBadgeClass}`}>{specialtyLabel}</span>
              <span className="text-xs text-slate-500">#{species.pokedexNumber}</span>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {onToggleTeam && (
              <button
                onClick={() => onToggleTeam(pokemon)}
                title={isInTeam ? '从队伍移出' : '加入出阵队伍'}
                className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                  isInTeam
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                }`}
              >
                {isInTeam ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => onAnalyze(pokemon)}
              title="个体分析 (PR 评估)"
              className="p-1.5 rounded-md text-amber-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(pokemon.id)}
              title="删除"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nature */}
        <div className="mt-3 text-xs text-slate-600 flex items-center justify-between bg-slate-50 p-2 rounded-md">
          <span>
            {getUIText('nature', locale)}: <strong>{getEntityName(nature, locale)}</strong>
          </span>
          {nature && (nature.positiveModifier || nature.negativeModifier) ? (
            <span className="text-2xs text-slate-500">
              {nature.positiveModifier && <span className="text-emerald-600">▲{nature.positiveModifier} </span>}
              {nature.negativeModifier && <span className="text-rose-500">▼{nature.negativeModifier}</span>}
            </span>
          ) : (
            <span className="text-2xs text-slate-400">无修正</span>
          )}
        </div>

        {/* Subskills */}
        <div className="mt-3">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {getUIText('subskills', locale)}
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { lvl: 10, key: 'level10' as const },
              { lvl: 25, key: 'level25' as const },
              { lvl: 50, key: 'level50' as const },
              { lvl: 75, key: 'level75' as const },
              { lvl: 100, key: 'level100' as const },
            ].map(({ lvl, key }) => {
              const name = pokemon.subskills[key];
              const subObj = GAME_DATA.subskills.find(
                (s) => s.name.toLowerCase() === name?.toLowerCase()
              );
              const isUnlocked = pokemon.level >= lvl;
              const badgeType = subObj ? `badge-${subObj.rarity}` : 'badge-white';
              return (
                <span
                  key={key}
                  className={`badge ${badgeType} ${!isUnlocked ? 'opacity-40 line-through' : ''}`}
                  title={`Lv.${lvl}: ${subObj?.name || '未设置'}`}
                >
                  Lv.{lvl} {subObj ? getEntityName(subObj, locale) : '—'}
                </span>
              );
            })}
          </div>
        </div>

        {/* Ingredients */}
        <div className="mt-3">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {getUIText('ingredients', locale)}
          </div>
          <div className="flex items-center space-x-2 text-xs">
            {[
              { slot: 'A (Lv.1)', name: pokemon.ingredients.slotA, unlocked: true },
              { slot: 'B (Lv.30)', name: pokemon.ingredients.slotB, unlocked: pokemon.level >= 30 },
              { slot: 'C (Lv.60)', name: pokemon.ingredients.slotC, unlocked: pokemon.level >= 60 },
            ].map((ing, idx) => {
              const ingObj = GAME_DATA.ingredients.find(
                (i) => i.name.toLowerCase() === ing.name?.toLowerCase()
              );
              return (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded text-xs ${
                    ing.unlocked ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {ing.slot}: {ingObj ? getEntityName(ingObj, locale) : '—'}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Production footer */}
      {production && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500">{getUIText('dailyEnergy', locale)}:</span>
          <span className="font-bold text-blue-600 text-sm">
            {production.totalDailyEnergy.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};
