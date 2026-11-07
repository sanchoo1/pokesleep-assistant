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
          alert(`成功导入 ${parsed.length} 只宝可梦！`);
        }
      } catch {
        alert('导入失败，请检查 JSON 格式！');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (confirm('警告：清空后所有本地盒子数据将被删除，确定继续？')) {
      await clearBox();
      onReload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Multi-Filter Toolbar */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search & Multi-Dimensional Filters */}
          <div className="flex flex-wrap flex-1 items-center gap-2">
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={getUIText('searchPlaceholder', locale)}
                className="input-field pl-9 text-xs py-1.5"
              />
            </div>

            <div className="flex items-center space-x-1">
              <Filter className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value as any)}
                className="input-field text-xs py-1.5 w-auto"
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
              className="input-field text-xs py-1.5 w-auto"
            >
              <option value="all">全部属性</option>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {getPokemonTypeLabel(t, locale)}属性
                </option>
              ))}
            </select>

            <select
              value={ingredientFilter}
              onChange={(e) => setIngredientFilter(e.target.value)}
              className="input-field text-xs py-1.5 w-auto"
            >
              <option value="all">全部食材</option>
              {GAME_DATA.ingredients.map((ing) => (
                <option key={ing.name} value={ing.name}>
                  含 {getEntityName(ing, locale)}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input-field text-xs py-1.5 w-auto"
            >
              <option value="energy">按日能量排序</option>
              <option value="rp">按 SP 排序</option>
              <option value="level">按等级排序</option>
              <option value="dex">按图鉴编号排序</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSendAwayModal(true)}
              className="btn btn-secondary text-xs tap-feedback"
              title="压制分析"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-500" />
              送走建议 ({inferiorList.length})
            </button>

            <label className="btn btn-secondary text-xs cursor-pointer tap-feedback">
              <Upload className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
              {getUIText('importJson', locale)}
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>

            <button onClick={handleExportJson} className="btn btn-secondary text-xs tap-feedback">
              <Download className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
              {getUIText('exportJson', locale)}
            </button>

            {pokemonList.length > 0 && (
              <button onClick={handleClearAll} className="btn btn-secondary text-xs text-rose-600 tap-feedback">
                {getUIText('clearAll', locale)}
              </button>
            )}

            <button onClick={handleOpenAdd} className="btn btn-primary text-xs tap-feedback">
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
                        送走
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
                关闭
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
