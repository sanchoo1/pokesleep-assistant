import React, { useState, useMemo } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { calculateDailyProduction } from '@pokesleep/engine';
import { BoxPokemon, clearBox, deletePokemon, importBox, savePokemon } from '../storage/db';
import { getEntityName, getUIText } from '../i18n';
import { PokemonCard } from './PokemonCard';
import { AddPokemonModal } from './AddPokemonModal';
import {
  Plus,
  Download,
  Upload,
  Trash,
  Search,
  Filter,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface BoxManagerProps {
  pokemonList: BoxPokemon[];
  onReload: () => void;
  locale: SupportedLocale;
  onAnalyze: (pokemon: BoxPokemon) => void;
  teamIds: string[];
  onToggleTeam: (pokemon: BoxPokemon) => void;
}

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
  const [sortBy, setSortBy] = useState<'level' | 'energy' | 'dex'>('energy');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showSendAwayModal, setShowSendAwayModal] = useState(false);

  // Filter & sort
  const filteredList = useMemo(() => {
    return pokemonList
      .filter((p) => {
        const species = GAME_DATA.pokemon.find(
          (sp) => sp.name.toUpperCase() === p.pokemonName.toUpperCase()
        );
        if (!species) return false;

        // Search
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

        // Specialty filter
        if (specialtyFilter !== 'all' && species.specialty !== specialtyFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'level') {
          return b.level - a.level;
        }
        if (sortBy === 'dex') {
          const spA = GAME_DATA.pokemon.find((s) => s.name.toUpperCase() === a.pokemonName.toUpperCase());
          const spB = GAME_DATA.pokemon.find((s) => s.name.toUpperCase() === b.pokemonName.toUpperCase());
          return (spA?.pokedexNumber || 0) - (spB?.pokedexNumber || 0);
        }
        // default energy
        const getEnergy = (pkmn: BoxPokemon) => {
          try {
            const activeSubs = [
              pkmn.subskills.level10,
              pkmn.level >= 25 ? pkmn.subskills.level25 : undefined,
              pkmn.level >= 50 ? pkmn.subskills.level50 : undefined,
            ].filter(Boolean) as string[];

            const res = calculateDailyProduction({
              pokemon: pkmn.pokemonName,
              level: pkmn.level,
              nature: pkmn.nature,
              subskills: activeSubs,
              ingredientSelection: { slot0: pkmn.ingredients.slotA },
            });
            return res.totalDailyEnergy;
          } catch {
            return 0;
          }
        };
        return getEnergy(b) - getEnergy(a);
      });
  }, [pokemonList, searchQuery, specialtyFilter, sortBy]);

  // Pareto domination analysis: find individuals of the same species where one strictly beats another
  const inferiorList = useMemo(() => {
    const list: Array<{ inferior: BoxPokemon; superior: BoxPokemon; reason: string }> = [];
    // Group by species
    const bySpecies: Record<string, BoxPokemon[]> = {};
    for (const p of pokemonList) {
      bySpecies[p.pokemonName] = bySpecies[p.pokemonName] || [];
      bySpecies[p.pokemonName].push(p);
    }

    for (const [_, group] of Object.entries(bySpecies)) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = 0; j < group.length; j++) {
          if (i === j) continue;
          const a = group[i];
          const b = group[j];
          // Check if b is superior to a at critical levels (Lv.30, Lv.50)
          try {
            const energyA30 = calculateDailyProduction({
              pokemon: a.pokemonName,
              level: 30,
              nature: a.nature,
              subskills: [a.subskills.level10, a.subskills.level25].filter(Boolean) as string[],
              ingredientSelection: {
                slot0: a.ingredients.slotA,
                slot30: a.ingredients.slotB || a.ingredients.slotA,
              },
            }).totalDailyEnergy;

            const energyB30 = calculateDailyProduction({
              pokemon: b.pokemonName,
              level: 30,
              nature: b.nature,
              subskills: [b.subskills.level10, b.subskills.level25].filter(Boolean) as string[],
              ingredientSelection: {
                slot0: b.ingredients.slotA,
                slot30: b.ingredients.slotB || b.ingredients.slotA,
              },
            }).totalDailyEnergy;

            if (energyB30 > energyA30 * 1.15) {
              list.push({
                inferior: a,
                superior: b,
                reason: `同定位在 Lv.30 预测能量低于对比个体 ${(
                  ((energyB30 - energyA30) / energyA30) *
                  100
                ).toFixed(0)}%`,
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

  const handleDelete = async (id: string) => {
    if (confirm(getUIText('confirmDelete', locale))) {
      await deletePokemon(id);
      onReload();
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pokemonList, null, 2));
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
      } catch (err) {
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
      {/* Top Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
        {/* Search & Filters */}
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getUIText('searchPlaceholder', locale)}
              className="input-field pl-9"
            />
          </div>

          <div className="flex items-center space-x-1">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value as any)}
              className="input-field text-xs py-1.5"
            >
              <option value="all">{getUIText('filterAll', locale)}</option>
              <option value="berry">{getUIText('filterBerry', locale)}</option>
              <option value="ingredient">{getUIText('filterIngredient', locale)}</option>
              <option value="skill">{getUIText('filterSkill', locale)}</option>
            </select>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="input-field text-xs py-1.5"
          >
            <option value="energy">按日能量排序</option>
            <option value="level">按等级排序</option>
            <option value="dex">按图鉴编号排序</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSendAwayModal(true)}
            className="btn btn-secondary text-xs"
            title="压制分析"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-500" />
            送走建议 ({inferiorList.length})
          </button>

          <label className="btn btn-secondary text-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5 mr-1 text-slate-500" />
            {getUIText('importJson', locale)}
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>

          <button onClick={handleExportJson} className="btn btn-secondary text-xs">
            <Download className="w-3.5 h-3.5 mr-1 text-slate-500" />
            {getUIText('exportJson', locale)}
          </button>

          <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary text-xs">
            <Plus className="w-4 h-4 mr-1" />
            {getUIText('addPokemon', locale)}
          </button>
        </div>
      </div>

      {/* Grid of Pokemon */}
      {filteredList.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <span className="text-4xl block mb-3">📦</span>
          <p className="text-slate-500 text-sm">{getUIText('emptyBoxHint', locale)}</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary mt-4 text-xs"
          >
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
              onAnalyze={onAnalyze}
              isInTeam={teamIds.includes(pkmn.id)}
              onToggleTeam={onToggleTeam}
            />
          ))}
        </div>
      )}

      {/* Send Away / Domination Modal */}
      {showSendAwayModal && (
        <div className="modal-backdrop">
          <div className="modal-panel p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold text-slate-900">
                  {getUIText('sendAwaySuggestion', locale)}
                </h3>
              </div>
              <button
                onClick={() => setShowSendAwayModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3">
              {inferiorList.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
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
                      className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">
                          {getEntityName(sp, locale)} Lv.{item.inferior.level}
                        </div>
                        <div className="text-amber-800 text-2xs mt-1">{item.reason}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(item.inferior.id)}
                        className="btn btn-danger text-xs py-1"
                      >
                        送走
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button onClick={() => setShowSendAwayModal(false)} className="btn btn-secondary">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / OCR Modal */}
      <AddPokemonModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (pkmn) => {
          await savePokemon(pkmn);
          onReload();
        }}
        locale={locale}
      />
    </div>
  );
};
