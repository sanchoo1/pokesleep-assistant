import React, { useState, useMemo } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { calculateDailyProduction } from '@pokesleep/engine';
import {
  BoxPokemon,
  clearBox,
  deletePokemon,
  importBox,
  normalizeBoxSubskills,
  savePokemon,
} from '../storage/db';
import { getEntityName, getPokemonTypeLabel, getUIText } from '../i18n';
import { PokemonCard } from './PokemonCard';
import { AddPokemonModal } from './AddPokemonModal';
import {
  Plus,
  Download,
  Upload,
  Search,
  Filter,
  AlertTriangle,
  Tent,
} from 'lucide-react';

interface BoxManagerProps {
  pokemonList: BoxPokemon[];
  onReload: () => void;
  locale: SupportedLocale;
  onAnalyze: (pokemon: BoxPokemon) => void;
  teamIds: string[];
  onToggleTeam: (pokemon: BoxPokemon) => void;
}

const ALL_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const BoxManager: React.FC<BoxManagerProps> = ({
  pokemonList,
  onReload,
  locale,
  onAnalyze,
  teamIds,
  onToggleTeam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<'all' | 'berry' | 'ingredient' | 'skill'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ingredientFilter, setIngredientFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'energy' | 'level' | 'dex' | 'rp'>('energy');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPokemon, setEditingPokemon] = useState<BoxPokemon | null>(null);
  const [showSendAwayModal, setShowSendAwayModal] = useState(false);

  const activeTeamCount = useMemo(() => {
    const set = new Set(pokemonList.map((p) => p.id));
    return teamIds.filter((id) => set.has(id)).length;
  }, [pokemonList, teamIds]);

  const getProdSummary = (pkmn: BoxPokemon) => {
    try {
      const sp = GAME_DATA.pokemon.find(
        (s) => s.name.toUpperCase() === pkmn.pokemonName.toUpperCase()
      );
      return calculateDailyProduction({
        pokemon: pkmn.pokemonName,
        level: pkmn.level,
        nature: pkmn.nature,
        subskills: normalizeBoxSubskills(pkmn.subskills),
        ingredientSelection: {
          slot0: pkmn.ingredients.slotA,
          slot30: pkmn.ingredients.slotB,
          slot60: pkmn.ingredients.slotC,
        },
        mainSkillLevel: pkmn.mainSkillLevel || 1 + (sp?.previousEvolutions || 0),
        ribbonLevel: pkmn.ribbonLevel || 0,
      });
    } catch {
      return null;
    }
  };

  // Filter & sort
  const filteredList = useMemo(() => {
    return pokemonList
      .filter((p) => {
        const species = GAME_DATA.pokemon.find(
          (sp) => sp.name.toUpperCase() === p.pokemonName.toUpperCase()
        );
        if (!species) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const nameZh = species.translations?.['zh-CN'] || '';
          const nameEn = species.translations?.['en'] || '';
          const nameJa = species.translations?.['ja'] || '';
          const nameTw = species.translations?.['zh-TW'] || '';
          const matches =
            nameZh.toLowerCase().includes(q) ||
            nameEn.toLowerCase().includes(q) ||
            nameJa.toLowerCase().includes(q) ||
            nameTw.toLowerCase().includes(q) ||
            species.pokedexNumber.toString() === q ||
            (p.nickname && p.nickname.toLowerCase().includes(q));
          if (!matches) return false;
        }

        if (specialtyFilter !== 'all' && species.specialty !== specialtyFilter) {
          return false;
        }

        if (typeFilter !== 'all' && species.type?.toLowerCase() !== typeFilter) {
          return false;
        }

        if (ingredientFilter !== 'all') {
          const pIngs = [p.ingredients.slotA, p.ingredients.slotB, p.ingredients.slotC].filter(
            Boolean
          ) as string[];
          if (!pIngs.some((i) => i.toLowerCase() === ingredientFilter.toLowerCase())) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'level') return b.level - a.level;
        if (sortBy === 'dex') {
          const spA = GAME_DATA.pokemon.find((s) => s.name.toUpperCase() === a.pokemonName.toUpperCase());
          const spB = GAME_DATA.pokemon.find((s) => s.name.toUpperCase() === b.pokemonName.toUpperCase());
          return (spA?.pokedexNumber || 0) - (spB?.pokedexNumber || 0);
        }
        const prodA = getProdSummary(a);
        const prodB = getProdSummary(b);
        if (sortBy === 'rp') {
          return (prodB?.rp || 0) - (prodA?.rp || 0);
        }
        return (prodB?.totalDailyEnergy || 0) - (prodA?.totalDailyEnergy || 0);
      });
  }, [pokemonList, searchQuery, specialtyFilter, typeFilter, ingredientFilter, sortBy]);

  // Pareto domination analysis across Lv.30 and Lv.60/70
  const inferiorList = useMemo(() => {
    const list: Array<{ inferior: BoxPokemon; superior: BoxPokemon; reason: string }> = [];
    const bySpecies: Record<string, BoxPokemon[]> = {};
    for (const p of pokemonList) {
      bySpecies[p.pokemonName] = bySpecies[p.pokemonName] || [];
      bySpecies[p.pokemonName].push(p);
    }

    for (const group of Object.values(bySpecies)) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = 0; j < group.length; j++) {
          if (i === j) continue;
          const a = group[i];
          const b = group[j];
          try {
            const pA50 = calculateDailyProduction({
              pokemon: a.pokemonName,
              level: 50,
              nature: a.nature,
              subskills: normalizeBoxSubskills(a.subskills),
              ingredientSelection: {
                slot0: a.ingredients.slotA,
                slot30: a.ingredients.slotB || a.ingredients.slotA,
              },
            }).totalDailyEnergy;

            const pB50 = calculateDailyProduction({
              pokemon: b.pokemonName,
              level: 50,
              nature: b.nature,
              subskills: normalizeBoxSubskills(b.subskills),
              ingredientSelection: {
                slot0: b.ingredients.slotA,
                slot30: b.ingredients.slotB || b.ingredients.slotA,
              },
            }).totalDailyEnergy;

            if (pB50 > pA50 * 1.15) {
              list.push({
                inferior: a,
                superior: b,
                reason: `同物种在 Lv.50 预测日能量低于对比个体 ${(((pB50 - pA50) / pA50) * 100).toFixed(0)}%`,
              });
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return list;
  }, [pokemonList]);

  const handleOpenAdd = () => {
    setEditingPokemon(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkmn: BoxPokemon) => {
    setEditingPokemon(pkmn);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm(getUIText('confirmDelete', locale))) {
      await deletePokemon(id);
      onReload();
    }
  };

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pokemonList, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pokesleep_box_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          await importBox(parsed);
          onReload();
          alert(getUIText('importSuccess', locale).replace('{0}', parsed.length.toString()));
        }
      } catch {
        alert(getUIText('importFailed', locale));
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (confirm(getUIText('confirmClearBox', locale))) {
      await clearBox();
      onReload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Multi-Filter Toolbar */}
      <div className="bg-[var(--surface)] p-3.5 sm:p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search & Multi-Dimensional Filters */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap flex-1 items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:min-w-[200px] sm:max-w-xs">
              <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={getUIText('searchPlaceholder', locale)}
                className="input-field pl-9 text-xs py-1.5 w-full"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
              <div className="flex items-center space-x-1 min-w-0">
                <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 hidden sm:inline" />
                <select
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value as any)}
                  className="input-field text-xs py-1.5 w-full sm:w-auto"
                >
                  <option value="all">{getUIText('filterAll', locale)}</option>
                  <option value="berry">{getUIText('filterBerry', locale)}</option>
                  <option value="ingredient">{getUIText('filterIngredient', locale)}</option>
                  <option value="skill">{getUIText('filterSkill', locale)}</option>
                </select>
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="input-field text-xs py-1.5 w-full sm:w-auto"
              >
                <option value="all">{getUIText('allTypes', locale)}</option>
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {getPokemonTypeLabel(t, locale)}
                  </option>
                ))}
              </select>

              <select
                value={ingredientFilter}
                onChange={(e) => setIngredientFilter(e.target.value)}
                className="input-field text-xs py-1.5 w-full sm:w-auto"
              >
                <option value="all">{getUIText('allIngredients', locale)}</option>
                {GAME_DATA.ingredients.map((ing) => (
                  <option key={ing.name} value={ing.name}>
                    {getUIText('withIngredient', locale).replace('{0}', getEntityName(ing, locale))}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="input-field text-xs py-1.5 w-full sm:w-auto"
              >
                <option value="energy">{getUIText('sortByEnergy', locale)}</option>
                <option value="rp">{getUIText('sortByRp', locale)}</option>
                <option value="level">{getUIText('sortByLevel', locale)}</option>
                <option value="dex">{getUIText('sortByDex', locale)}</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0 border-t lg:border-t-0 border-[var(--border-subtle)]/50">
            <div
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                activeTeamCount === 5
                  ? 'bg-[var(--primary-light)] border-[var(--primary)] text-[var(--primary)]'
                  : 'bg-[#f7f5ee] border-[#eae4d6] text-[var(--text-main)]'
              }`}
              title="当前出阵队伍编制人数（上限 5 只）"
            >
              <Tent className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{getUIText('teamCount', locale).replace('{0}', activeTeamCount.toString())}</span>
              {activeTeamCount === 5 && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--primary)] text-white ml-0.5 leading-none">
                  {getUIText('teamFull', locale)}
                </span>
              )}
            </div>

            <button
              onClick={() => setShowSendAwayModal(true)}
              className="btn btn-secondary text-xs tap-feedback py-1.5"
              title={getUIText('sendAwaySuggestion', locale)}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-500" />
              {getUIText('sendAwaySuggestion', locale)} ({inferiorList.length})
            </button>

            <label className="btn btn-secondary text-xs cursor-pointer tap-feedback py-1.5">
              <Upload className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
              导入
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>

            <button onClick={handleExportJson} className="btn btn-secondary text-xs tap-feedback py-1.5">
              <Download className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
              导出
            </button>

            {pokemonList.length > 0 && (
              <button onClick={handleClearAll} className="btn btn-secondary text-xs text-rose-600 tap-feedback py-1.5">
                {getUIText('clearAll', locale)}
              </button>
            )}

            <button onClick={handleOpenAdd} className="btn btn-primary text-xs tap-feedback py-1.5 flex-1 sm:flex-none">
              <Plus className="w-4 h-4 mr-1" />
              {getUIText('addPokemon', locale)}
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Pokemon */}
      {filteredList.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface)] rounded-2xl border-2 border-dashed border-[#d8cfbf] shadow-2xs">
          <span className="text-4xl block mb-3 drop-shadow-xs">🏕️</span>
          <p className="text-[var(--text-muted)] text-sm font-medium">{getUIText('emptyBoxHint', locale)}</p>
          <button onClick={handleOpenAdd} className="btn btn-primary mt-4 text-xs tap-feedback">
            <Plus className="w-4 h-4 mr-1" />
            {getUIText('addPokemon', locale)}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map((pkmn) => (
            <PokemonCard
              key={pkmn.id}
              pokemon={pkmn}
              locale={locale}
              onDelete={handleDelete}
              onEdit={handleOpenEdit}
              onAnalyze={onAnalyze}
              isInTeam={teamIds.includes(pkmn.id)}
              onToggleTeam={onToggleTeam}
            />
          ))}
        </div>
      )}

      {/* Send Away / Domination Modal */}
      {showSendAwayModal && (
        <div
          className="modal-backdrop animate-backdrop-in"
          onClick={() => setShowSendAwayModal(false)}
        >
          <div
            className="modal-panel p-6 animate-panel-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-[#eae4d6]">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  {getUIText('sendAwaySuggestion', locale)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSendAwayModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-[#f4efe6] tap-feedback cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3">
              {inferiorList.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm font-medium">
                  {getUIText('noInferiorPokemon', locale)}
                </div>
              ) : (
                inferiorList.map((item, idx) => {
                  const sp = GAME_DATA.pokemon.find(
                    (p) => p.name.toUpperCase() === item.inferior.pokemonName.toUpperCase()
                  );
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-[var(--text-main)]">
                          {getEntityName(sp, locale)} Lv.{item.inferior.level}
                          {item.inferior.nickname ? ` (${item.inferior.nickname})` : ''}
                        </div>
                        <div className="text-amber-800 text-2xs mt-1">{item.reason}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(item.inferior.id)}
                        className="btn btn-danger text-xs py-1 tap-feedback"
                      >
                        {getUIText('sendAwayBtn', locale)}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#eae4d6]">
              <button
                type="button"
                onClick={() => setShowSendAwayModal(false)}
                className="btn btn-secondary text-xs tap-feedback"
              >
                {getUIText('close', locale)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit / OCR Modal */}
      <AddPokemonModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPokemon(null);
        }}
        initialData={editingPokemon || undefined}
        onSave={async (pkmn) => {
          await savePokemon(pkmn);
          onReload();
        }}
        locale={locale}
      />
    </div>
  );
};
