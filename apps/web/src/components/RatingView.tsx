import React, { useState, useMemo } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { ratePokemon, RatingResult } from '@pokesleep/engine';
import { BoxPokemon } from '../storage/db';
import { getEntityName, getUIText } from '../i18n';
import { Sparkles, Trophy, ArrowUpRight, ShieldAlert, Award } from 'lucide-react';

interface RatingViewProps {
  initialPokemon?: BoxPokemon | null;
  locale: SupportedLocale;
  onClearInitial?: () => void;
}

export const RatingView: React.FC<RatingViewProps> = ({ initialPokemon, locale }) => {
  const [selectedSpecies, setSelectedSpecies] = useState(
    initialPokemon?.pokemonName || 'PIKACHU'
  );
  const [currentLevel, setCurrentLevel] = useState(initialPokemon?.level || 25);
  const [targetLevel, setTargetLevel] = useState(50);
  const [natureName, setNatureName] = useState(initialPokemon?.nature || 'Adamant');

  const [subskills, setSubskills] = useState({
    level10: initialPokemon?.subskills?.level10 || 'Berry Finding S',
    level25: initialPokemon?.subskills?.level25 || 'Helping Speed M',
    level50: initialPokemon?.subskills?.level50 || 'Inventory Up L',
    level75: initialPokemon?.subskills?.level75 || '',
    level100: initialPokemon?.subskills?.level100 || '',
  });

  const [ingredients, setIngredients] = useState({
    slotA: initialPokemon?.ingredients?.slotA || 'Apple',
    slotB: initialPokemon?.ingredients?.slotB || 'Apple',
    slotC: initialPokemon?.ingredients?.slotC || 'Apple',
  });

  const species = useMemo(() => {
    return (
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === selectedSpecies.toUpperCase()
      ) || GAME_DATA.pokemon[0]
    );
  }, [selectedSpecies]);

  // Compute Rate My Pokémon rating
  const ratingResult: RatingResult | null = useMemo(() => {
    try {
      const activeSubs = [
        { lvl: 10, name: subskills.level10 },
        { lvl: 25, name: subskills.level25 },
        { lvl: 50, name: subskills.level50 },
        { lvl: 75, name: subskills.level75 },
        { lvl: 100, name: subskills.level100 },
      ]
        .filter((s) => s.lvl <= targetLevel && s.name)
        .map((s) => s.name);

      return ratePokemon({
        pokemon: selectedSpecies,
        level: targetLevel,
        nature: natureName,
        subskills: activeSubs,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [selectedSpecies, targetLevel, natureName, subskills]);

  // Multi-level projection (Lv.25, 30, 50, 60, 70)
  const projection = useMemo(() => {
    const levels = [25, 30, 50, 60, 70];
    return levels.map((lvl) => {
      try {
        const subs = [
          { lvl: 10, name: subskills.level10 },
          { lvl: 25, name: subskills.level25 },
          { lvl: 50, name: subskills.level50 },
          { lvl: 75, name: subskills.level75 },
          { lvl: 100, name: subskills.level100 },
        ]
          .filter((s) => s.lvl <= lvl && s.name)
          .map((s) => s.name);

        const res = ratePokemon({
          pokemon: selectedSpecies,
          level: lvl,
          nature: natureName,
          subskills: subs,
        });
        return { level: lvl, pr: res.percentile, position: res.percentagePosition };
      } catch {
        return { level: lvl, pr: 0, position: 0 };
      }
    });
  }, [selectedSpecies, natureName, subskills]);

  const prColor = (pr: number) => {
    if (pr >= 90) return 'text-amber-500';
    if (pr >= 75) return 'text-blue-600';
    if (pr >= 50) return 'text-emerald-600';
    return 'text-slate-500';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <div className="flex items-center space-x-2 pb-4 mb-4 border-b border-slate-100">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900">{getUIText('rateMyPokemon', locale)}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Config Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                选择宝可梦
              </label>
              <select
                value={selectedSpecies}
                onChange={(e) => setSelectedSpecies(e.target.value)}
                className="input-field"
              >
                {GAME_DATA.pokemon.map((p) => (
                  <option key={p.name} value={p.name}>
                    #{p.pokedexNumber} {getEntityName(p, locale)} ({p.specialty})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  当前等级: {currentLevel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={70}
                  value={currentLevel}
                  onChange={(e) => setCurrentLevel(Number(e.target.value))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  评估目标等级: {targetLevel}
                </label>
                <select
                  value={targetLevel}
                  onChange={(e) => setTargetLevel(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={25}>Lv. 25</option>
                  <option value={30}>Lv. 30 (开二食材)</option>
                  <option value={50}>Lv. 50 (标准毕业)</option>
                  <option value={60}>Lv. 60 (开三食材)</option>
                  <option value={70}>Lv. 70 (当前上限)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {getUIText('nature', locale)}
              </label>
              <select
                value={natureName}
                onChange={(e) => setNatureName(e.target.value)}
                className="input-field"
              >
                {GAME_DATA.natures.map((n) => (
                  <option key={n.name} value={n.name}>
                    {getEntityName(n, locale)}
                    {n.positiveModifier ? ` (▲${n.positiveModifier} ▼${n.negativeModifier})` : ' (中性)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                副技能配置 (至 Lv.{targetLevel})
              </label>
              <div className="space-y-1.5">
                {[
                  { lvl: 10, key: 'level10' as const },
                  { lvl: 25, key: 'level25' as const },
                  { lvl: 50, key: 'level50' as const },
                  { lvl: 75, key: 'level75' as const },
                  { lvl: 100, key: 'level100' as const },
                ].map(({ lvl, key }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-bold w-14 ${
                        lvl <= targetLevel ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      Lv.{lvl}
                    </span>
                    <select
                      value={subskills[key]}
                      onChange={(e) => setSubskills({ ...subskills, [key]: e.target.value })}
                      className="input-field text-xs py-1"
                    >
                      <option value="">(无)</option>
                      {GAME_DATA.subskills.map((s) => (
                        <option key={s.name} value={s.name}>
                          [{s.rarity.toUpperCase()}] {getEntityName(s, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: PR Rating Gauges */}
          <div className="lg:col-span-2 flex flex-col justify-between space-y-6">
            {ratingResult ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* PR Percentile */}
                  <div className="card p-5 text-center bg-gradient-to-b from-blue-50/50 to-white">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      {getUIText('percentilePR', locale)}
                    </div>
                    <div className={`text-5xl font-black ${prColor(ratingResult.percentile)}`}>
                      {ratingResult.percentile}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      前 {(100 - ratingResult.percentile).toFixed(1)}% 的强力组合
                    </div>
                  </div>

                  {/* Range Position */}
                  <div className="card p-5 text-center bg-gradient-to-b from-indigo-50/50 to-white">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      {getUIText('percentPosition', locale)}
                    </div>
                    <div className="text-5xl font-black text-indigo-600">
                      {ratingResult.percentagePosition}%
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      最差 0% ~ 最佳 100% 相对位置
                    </div>
                  </div>

                  {/* Relative Gain */}
                  <div className="card p-5 text-center bg-gradient-to-b from-emerald-50/50 to-white">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      {getUIText('relativeGain', locale)}
                    </div>
                    <div className="text-5xl font-black text-emerald-600">
                      +{ratingResult.relativeGain}%
                    </div>
                    <div className="text-xs text-slate-500 mt-2">相比无性格/无副技能基准</div>
                  </div>
                </div>

                {/* Level Milestones Projection Table */}
                <div className="card p-4">
                  <div className="text-xs font-bold text-slate-700 mb-3 flex items-center">
                    <Award className="w-4 h-4 mr-1 text-blue-600" />
                    各关键养成等级 PR 预期走势
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {projection.map((item) => (
                      <div
                        key={item.level}
                        className={`p-2.5 rounded-lg border ${
                          item.level === targetLevel
                            ? 'bg-blue-50 border-blue-400 font-bold'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="text-xs text-slate-500">Lv.{item.level}</div>
                        <div className={`text-lg font-extrabold mt-1 ${prColor(item.pr)}`}>
                          PR {item.pr}
                        </div>
                        <div className="text-2xs text-slate-400 mt-0.5">{item.position}% 位</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Theoretical Best & Worst Combos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Best */}
                  <div className="card p-4 border-l-4 border-l-emerald-500">
                    <div className="flex items-center space-x-1.5 text-emerald-700 font-bold text-xs mb-2">
                      <Trophy className="w-4 h-4" />
                      <span>{getUIText('bestCombination', locale)}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格: <strong>{ratingResult.bestCombination.natureName}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ratingResult.bestCombination.subskillNames.map((s, i) => (
                        <span key={i} className="badge badge-gold text-2xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Worst */}
                  <div className="card p-4 border-l-4 border-l-rose-400">
                    <div className="flex items-center space-x-1.5 text-rose-700 font-bold text-xs mb-2">
                      <ShieldAlert className="w-4 h-4" />
                      <span>{getUIText('worstCombination', locale)}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格: <strong>{ratingResult.worstCombination.natureName}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ratingResult.worstCombination.subskillNames.map((s, i) => (
                        <span key={i} className="badge badge-silver text-2xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                计算中或参数异常，请核对副技能与性格设置。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
