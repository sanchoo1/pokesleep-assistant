import React, { useState, useMemo, useEffect } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  RecipeType,
  MainskillUnit,
  getBerryImageUrl,
  getIngredientImageUrl,
  getRecipeImageUrl,
  getSkillImageUrl,
  getTypeImageUrl,
} from '@pokesleep/data';
import {
  evaluatePokemonMilestones,
  calculateDailyProduction,
  analyzeIndividualRecipeCoverage,
  EvaluationMetric,
} from '@pokesleep/engine';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getNatureModLabel, getPokemonTypeLabel, getUIText } from '../i18n';
import { PokemonSelector } from './PokemonSelector';
import {
  Sparkles,
  Trophy,
  ShieldAlert,
  Award,
  Zap,
  Apple,
  Utensils,
  Flame,
  CheckCircle2,
} from 'lucide-react';

interface RatingViewProps {
  initialPokemon?: BoxPokemon | null;
  locale: SupportedLocale;
  onClearInitial?: () => void;
}

const SKILL_UNIT_LABELS: Record<MainskillUnit, { label: string; unitSuffix: string }> = {
  berries: { label: '技能树果产出', unitSuffix: '颗树果' },
  energy: { label: '活力回复量', unitSuffix: '点活力' },
  strength: { label: '直接卡比兽能量', unitSuffix: '能量' },
  ingredients: { label: '技能额外食材', unitSuffix: '个食材' },
  'pot size': { label: '料理锅容量扩充', unitSuffix: '格容量' },
  helps: { label: '额外帮手帮忙', unitSuffix: '次帮忙' },
  'skill helps': { label: '技能帮忙触发', unitSuffix: '次' },
  'dream shards': { label: '梦之碎片获取', unitSuffix: '碎片' },
  'crit chance': { label: '料理大成功暴击率', unitSuffix: '% 暴击' },
  'berry zone': { label: '树果领域加成', unitSuffix: '次领域' },
  candy: { label: '糖果产出', unitSuffix: '颗糖果' },
  items: { label: '道具获取', unitSuffix: '个道具' },
};

export const RatingView: React.FC<RatingViewProps> = ({ initialPokemon, locale }) => {
  const [selectedSpecies, setSelectedSpecies] = useState(
    initialPokemon?.pokemonName || 'PIKACHU'
  );
  const [natureName, setNatureName] = useState(initialPokemon?.nature || 'Adamant');
  const [subskills, setSubskills] = useState(() =>
    initialPokemon
      ? normalizeBoxSubskills(initialPokemon.subskills)
      : {
          level10: 'Berry Finding S',
          level25: 'Helping Speed M',
          level50: 'Skill Trigger M',
          level70: 'Helping Bonus',
          level80: '',
        }
  );
  const [ingredients, setIngredients] = useState({
    slotA: initialPokemon?.ingredients?.slotA || 'Apple',
    slotB: initialPokemon?.ingredients?.slotB || 'Apple',
    slotC: initialPokemon?.ingredients?.slotC || 'Apple',
  });
  const [mainSkillLevel, setMainSkillLevel] = useState(initialPokemon?.mainSkillLevel || 1);
  const [simulateMaxSkillSeed, setSimulateMaxSkillSeed] = useState(false);
  const [isFavoredBerry, setIsFavoredBerry] = useState(true);
  const [mapBonus, setMapBonus] = useState(0);
  const [metric, setMetric] = useState<EvaluationMetric>('auto');

  const species = useMemo(() => {
    return (
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === selectedSpecies.toUpperCase()
      ) || GAME_DATA.pokemon[0]
    );
  }, [selectedSpecies]);

  // Inspected milestone stage in detail panel (auto-selected by specialty, clickable by user)
  const [focusedLevel, setFocusedLevel] = useState<number>(60);
  const [activeDeepTab, setActiveDeepTab] = useState<'berry' | 'ingredient' | 'skill'>(
    species.specialty === 'all' ? 'skill' : species.specialty
  );
  const [recipeDishTab, setRecipeDishTab] = useState<RecipeType>('curry');

  // Sync when navigating from BoxManager "Analyze" button
  useEffect(() => {
    if (!initialPokemon) return;
    const sp =
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === initialPokemon.pokemonName.toUpperCase()
      ) || GAME_DATA.pokemon[0];
    setSelectedSpecies(sp.name);
    setNatureName(initialPokemon.nature || 'Adamant');
    setSubskills(normalizeBoxSubskills(initialPokemon.subskills));
    setIngredients({
      slotA: initialPokemon.ingredients?.slotA || sp.ingredient0?.[0]?.ingredient || 'Apple',
      slotB: initialPokemon.ingredients?.slotB || sp.ingredient30?.[0]?.ingredient || 'Apple',
      slotC: initialPokemon.ingredients?.slotC || sp.ingredient60?.[0]?.ingredient || 'Apple',
    });
    setMainSkillLevel(initialPokemon.mainSkillLevel || 1 + (sp.previousEvolutions || 0));
    setActiveDeepTab(sp.specialty === 'all' ? 'skill' : sp.specialty);
    setFocusedLevel(sp.specialty === 'ingredient' ? 60 : 50);
  }, [initialPokemon]);

  const handleSpeciesChange = (newSpeciesName: string) => {
    setSelectedSpecies(newSpeciesName);
    const sp = GAME_DATA.pokemon.find(
      (p) => p.name.toUpperCase() === newSpeciesName.toUpperCase()
    );
    if (sp) {
      setIngredients({
        slotA: sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotB: sp.ingredient30?.[0]?.ingredient || sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotC: sp.ingredient60?.[0]?.ingredient || sp.ingredient0?.[0]?.ingredient || 'Apple',
      });
      setMainSkillLevel(Math.min(sp.skill.maxLevel || 6, 1 + (sp.previousEvolutions || 0)));
      setActiveDeepTab(sp.specialty === 'all' ? 'skill' : sp.specialty);
      setFocusedLevel(sp.specialty === 'ingredient' ? 60 : 50);
    }
  };

  const validSlotA = useMemo(
    () => (species.ingredient0 || []).filter((i) => i.ingredient !== 'Locked'),
    [species]
  );
  const validSlotB = useMemo(
    () => (species.ingredient30 || []).filter((i) => i.ingredient !== 'Locked'),
    [species]
  );
  const validSlotC = useMemo(
    () => (species.ingredient60 || []).filter((i) => i.ingredient !== 'Locked'),
    [species]
  );

  const effectiveInputSkillLevel = simulateMaxSkillSeed
    ? species.skill.maxLevel || 6
    : mainSkillLevel;

  // Automatic Multi-Stage Evaluation across [10, 25, 30, 50, 60, 70]
  const multiReport = useMemo(() => {
    try {
      return evaluatePokemonMilestones({
        pokemon: species,
        nature: natureName,
        subskills,
        ingredientSelection: {
          slot0: ingredients.slotA,
          slot30: ingredients.slotB,
          slot60: ingredients.slotC,
        },
        mainSkillLevel: effectiveInputSkillLevel,
        metric,
        isFavoredBerry,
        mapBonus,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [
    species,
    natureName,
    subskills,
    ingredients,
    effectiveInputSkillLevel,
    metric,
    isFavoredBerry,
    mapBonus,
  ]);

  const focusedStage = useMemo(() => {
    if (!multiReport) return null;
    return (
      multiReport.milestones.find((m) => m.level === focusedLevel) ||
      multiReport.milestones[multiReport.milestones.length - 1]
    );
  }, [multiReport, focusedLevel]);

  const focusedProd = focusedStage?.rating.currentProduction || null;

  // Compare favored vs unfavored berry production at focusedLevel for Berry Deep-Dive
  const berryComparison = useMemo(() => {
    if (!focusedProd) return null;
    const favored = calculateDailyProduction({
      pokemon: species,
      level: focusedLevel,
      nature: natureName,
      subskills,
      ingredientSelection: {
        slot0: ingredients.slotA,
        slot30: ingredients.slotB,
        slot60: ingredients.slotC,
      },
      mainSkillLevel: effectiveInputSkillLevel,
      isFavoredBerry: true,
      mapBonus,
    });
    const unfavored = calculateDailyProduction({
      pokemon: species,
      level: focusedLevel,
      nature: natureName,
      subskills,
      ingredientSelection: {
        slot0: ingredients.slotA,
        slot30: ingredients.slotB,
        slot60: ingredients.slotC,
      },
      mainSkillLevel: effectiveInputSkillLevel,
      isFavoredBerry: false,
      mapBonus,
    });
    return { favored, unfavored };
  }, [
    focusedProd,
    species,
    focusedLevel,
    natureName,
    subskills,
    ingredients,
    effectiveInputSkillLevel,
    mapBonus,
  ]);

  // Recipe coverage at focusedLevel (defaults to Lv.60 if focusedLevel < 60 toggleable, or actual focusedProd)
  const focusedRecipeCoverage = useMemo(() => {
    if (!focusedProd) return null;
    return analyzeIndividualRecipeCoverage(focusedProd, 100);
  }, [focusedProd]);

  const berryObj = useMemo(() => {
    return GAME_DATA.berries.find(
      (b) => b.name.toUpperCase() === species.berry.toUpperCase()
    );
  }, [species]);

  const prColor = (pr: number) => {
    if (pr >= 90) return 'text-amber-500';
    if (pr >= 75) return 'text-blue-600';
    if (pr >= 50) return 'text-emerald-600';
    return 'text-slate-500';
  };

  const gradeBadgeStyle = (grade: string) => {
    if (grade === 'S+') return 'bg-amber-500 text-white';
    if (grade === 'S') return 'bg-amber-100 text-amber-800 border border-amber-300';
    if (grade === 'A') return 'bg-blue-100 text-blue-800 border border-blue-300';
    if (grade === 'B') return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  };

  const metricLabel = (m: string) => {
    switch (m) {
      case 'berry_energy':
        return '每日树果能量';
      case 'ingredient_energy':
        return '每日食材能量';
      case 'ingredient_count':
        return '每日食材总产量';
      case 'skill_procs':
        return '每日技能期望触发次数';
      case 'skill_energy':
        return '每日技能折算能量';
      default:
        return '每日综合总能量';
    }
  };

  const maxSkillLvl = species.skill.maxLevel || 6;

  return (
    <div className="space-y-6">
      {/* Top Card: Configuration + Auto Multi-Stage PR Matrix */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">
              全阶段个体综合评估 (自动覆盖 Lv.10 – Lv.70)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            无需填写当前等级，自动推演各副技能与食材槽解锁阶段表现（当前游戏上限 Lv.70）
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (4 cols): Individual Config */}
          <div className="lg:col-span-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                选择宝可梦 (支持属性 / 专长 / 食材多维筛选)
              </label>
              <PokemonSelector
                value={selectedSpecies}
                onChange={handleSpeciesChange}
                locale={locale}
              />
            </div>

            {/* Nature & Evaluation Metric */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {getUIText('nature', locale)}
                </label>
                <select
                  value={natureName}
                  onChange={(e) => setNatureName(e.target.value)}
                  className="input-field text-xs py-1.5"
                >
                  {GAME_DATA.natures.map((n) => (
                    <option key={n.name} value={n.name}>
                      {getEntityName(n, locale)}
                      {n.positiveModifier && n.positiveModifier !== 'neutral'
                        ? ` (▲${getNatureModLabel(n.positiveModifier, locale)} ▼${getNatureModLabel(n.negativeModifier, locale)})`
                        : ' (中性)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PR 评分维度
                </label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as EvaluationMetric)}
                  className="input-field text-xs py-1.5"
                >
                  <option value="auto">自动匹配专长 (推荐)</option>
                  <option value="total_energy">每日综合总能量</option>
                  <option value="berry_energy">纯树果能量</option>
                  <option value="ingredient_energy">食材能量产出</option>
                  <option value="ingredient_count">食材数量产出</option>
                  <option value="skill_procs">技能触发次数</option>
                  <option value="skill_energy">技能等效总价值</option>
                </select>
              </div>
            </div>

            {/* 5 Subskills: Lv.10, 25, 50, 70, 80 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                副技能配置 (Lv.10 / 25 / 50 / 70，Lv.80 暂未开放上限)
              </label>
              <div className="space-y-1.5">
                {(
                  [
                    { lvl: 10, key: 'level10' as const, capLocked: false },
                    { lvl: 25, key: 'level25' as const, capLocked: false },
                    { lvl: 50, key: 'level50' as const, capLocked: false },
                    { lvl: 70, key: 'level70' as const, capLocked: false },
                    { lvl: 80, key: 'level80' as const, capLocked: true },
                  ]
                ).map(({ lvl, key, capLocked }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-bold w-16 shrink-0 ${
                        capLocked
                          ? 'text-slate-400'
                          : lvl <= focusedLevel
                            ? 'text-blue-600'
                            : 'text-slate-600'
                      }`}
                    >
                      {capLocked ? '🔒Lv.80' : `Lv.${lvl}`}
                    </span>
                    <select
                      value={subskills[key]}
                      onChange={(e) => setSubskills({ ...subskills, [key]: e.target.value })}
                      className={`input-field text-xs py-1 ${capLocked ? 'bg-slate-50 text-slate-500' : ''}`}
                    >
                      <option value="">(无 / 未设置)</option>
                      {GAME_DATA.subskills.map((s) => (
                        <option key={s.name} value={s.name}>
                          [{s.rarity === 'gold' ? '金' : s.rarity === 'silver' ? '银' : '白'}] {getEntityName(s, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients A / B / C with Official Icons */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                食材槽配置 (A: Lv.1 / B: Lv.30 / C: Lv.60)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Lv.1 (A)', key: 'slotA' as const, list: validSlotA },
                  { label: 'Lv.30 (B)', key: 'slotB' as const, list: validSlotB },
                  { label: 'Lv.60 (C)', key: 'slotC' as const, list: validSlotC },
                ].map(({ label, key, list }) => (
                  <div key={key} className="p-1.5 rounded-lg border border-slate-200 bg-slate-50/70">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                      {ingredients[key] && (
                        <img
                          src={getIngredientImageUrl(ingredients[key])}
                          alt={ingredients[key]}
                          className="w-4 h-4 object-contain"
                        />
                      )}
                    </div>
                    <select
                      value={ingredients[key]}
                      onChange={(e) => setIngredients({ ...ingredients, [key]: e.target.value })}
                      className="input-field text-xs py-1 bg-white px-1.5"
                    >
                      {list.map((item) => {
                        const ingObj = GAME_DATA.ingredients.find(
                          (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                        );
                        return (
                          <option key={item.ingredient} value={item.ingredient}>
                            {ingObj ? getEntityName(ingObj, locale) : item.ingredient} ×{item.amount}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Skill Level + Island / Favored Berry Toggles */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center space-x-1">
                  <img
                    src={getSkillImageUrl(species.skill.image)}
                    alt=""
                    className="w-4 h-4 object-contain"
                  />
                  <span>基础主技能等级:</span>
                </span>
                <div className="flex items-center space-x-2">
                  <select
                    value={mainSkillLevel}
                    disabled={simulateMaxSkillSeed}
                    onChange={(e) => setMainSkillLevel(Number(e.target.value))}
                    className="input-field text-xs py-0.5 w-20 bg-white"
                  >
                    {Array.from({ length: maxSkillLvl }, (_, i) => i + 1).map((l) => (
                      <option key={l} value={l}>
                        Lv.{l}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center space-x-1 cursor-pointer text-indigo-700 font-medium">
                    <input
                      type="checkbox"
                      checked={simulateMaxSkillSeed}
                      onChange={(e) => setSimulateMaxSkillSeed(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>满级金瓜子</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                <label className="inline-flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isFavoredBerry}
                    onChange={(e) => setIsFavoredBerry(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>适性树果 (能量 ×2)</span>
                </label>

                <div className="flex items-center space-x-1">
                  <span className="text-slate-600">岛屿加成:</span>
                  <input
                    type="number"
                    min={0}
                    max={85}
                    step={5}
                    value={mapBonus}
                    onChange={(e) => setMapBonus(Math.min(85, Math.max(0, Number(e.target.value))))}
                    className="input-field text-xs py-0.5 w-14 bg-white text-center"
                  />
                  <span className="text-slate-500">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (8 cols): Auto Multi-Stage Milestone Dashboard */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
            {multiReport && focusedStage && focusedProd ? (
              <>
                {/* Summary Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="card p-4 text-center bg-gradient-to-b from-amber-50/60 to-white border-amber-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      全阶段平均 PR 百分位
                    </div>
                    <div className={`text-4xl font-black mt-1 ${prColor(multiReport.averagePercentile)}`}>
                      PR {multiReport.averagePercentile}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      评估指标：{metricLabel(multiReport.evaluatedMetric)}
                    </div>
                  </div>

                  <div className="card p-4 text-center bg-gradient-to-b from-blue-50/60 to-white border-blue-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      巅峰强势阶段 (Lv.{multiReport.peakStage.level})
                    </div>
                    <div className="text-4xl font-black text-blue-600 mt-1">
                      PR {multiReport.peakStage.rating.percentile}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      {multiReport.peakStage.unlockNote}
                    </div>
                  </div>

                  <div className="card p-4 text-center bg-gradient-to-b from-emerald-50/60 to-white border-emerald-200">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">
                      Lv.{focusedStage.level} 相对白板增益
                    </div>
                    <div className="text-4xl font-black text-emerald-600 mt-1">
                      {focusedStage.rating.relativeGain >= 0 ? '+' : ''}
                      {focusedStage.rating.relativeGain}%
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      区间位置 {focusedStage.rating.percentagePosition}% | SP {focusedProd.rp.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* All 6 Progression Stages Matrix (Lv.10, 25, 30, 50, 60, 70) */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-slate-800 flex items-center">
                      <Award className="w-4 h-4 mr-1.5 text-blue-600" />
                      全等级阶段自动评分表（点击任意等级切换下方专项详情）
                    </div>
                    <span className="text-2xs text-slate-400">
                      当前查看：Lv.{focusedLevel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    {multiReport.milestones.map((m) => {
                      const isSelected = m.level === focusedLevel;
                      const prod = m.rating.currentProduction;
                      return (
                        <button
                          type="button"
                          key={m.level}
                          onClick={() => setFocusedLevel(m.level)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-400/50 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-800">
                                Lv.{m.level}
                              </span>
                              <span
                                className={`text-2xs font-black px-1.5 py-0.5 rounded ${gradeBadgeStyle(
                                  m.rating.grade
                                )}`}
                              >
                                {m.rating.grade}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {m.unlockNote}
                            </div>
                          </div>

                          <div className="mt-2.5">
                            <div className={`text-xl font-black ${prColor(m.rating.percentile)}`}>
                              PR {m.rating.percentile}
                            </div>
                            {/* Visual PR Progress Bar */}
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${
                                  m.rating.percentile >= 85
                                    ? 'bg-amber-500'
                                    : m.rating.percentile >= 70
                                      ? 'bg-blue-500'
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(4, m.rating.percentile)}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-slate-200/70 text-[11px] text-slate-600 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-slate-400">总能量</span>
                              <span className="font-bold text-slate-800">
                                {Math.round(prod.totalDailyEnergy).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">
                                {species.specialty === 'skill'
                                  ? '技能/天'
                                  : species.specialty === 'ingredient'
                                    ? '食材/天'
                                    : '树果能量'}
                              </span>
                              <span className="font-semibold text-blue-700">
                                {species.specialty === 'skill'
                                  ? `${prod.dailySkillProcs.toFixed(2)}次`
                                  : species.specialty === 'ingredient'
                                    ? `${prod.dailyIngredientCount.toFixed(1)}个`
                                    : Math.round(prod.dailyBerryEnergy).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {subskills.level80 && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-slate-100 text-2xs text-slate-600 flex items-center justify-between">
                      <span>
                        🔒 第 5 副技能槽 (<strong>Lv.80</strong>)：已记录为「
                        {getEntityName(
                          GAME_DATA.subskills.find(
                            (s) => s.name.toLowerCase() === subskills.level80.toLowerCase()
                          ),
                          locale
                        ) || subskills.level80}
                        」，因当前版本游戏等级上限为 <strong>Lv.70</strong>，暂不计入当前版本评分。
                      </span>
                    </div>
                  )}
                </div>

                {/* Best & Worst Combinations at Focused Stage */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="card p-3.5 border-l-4 border-l-emerald-500">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-bold text-xs">
                        <Trophy className="w-4 h-4" />
                        <span>Lv.{focusedStage.level} 理论最佳配置</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">
                        {focusedStage.rating.bestScore.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格:{' '}
                      <strong>
                        {getEntityName(
                          GAME_DATA.natures.find(
                            (n) => n.name === focusedStage.rating.bestCombination.natureName
                          ),
                          locale
                        )}
                      </strong>{' '}
                      | 食材槽: <strong>{focusedStage.rating.bestCombination.ingredientCombo}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {focusedStage.rating.bestCombination.subskillNames.map((s, i) => {
                        const subObj = GAME_DATA.subskills.find((x) => x.name === s);
                        return (
                          <span key={i} className={`badge badge-${subObj?.rarity || 'gold'} text-2xs`}>
                            {subObj ? getEntityName(subObj, locale) : s}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="card p-3.5 border-l-4 border-l-rose-400">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-rose-700 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Lv.{focusedStage.level} 理论最差配置</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600">
                        {focusedStage.rating.worstScore.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      性格:{' '}
                      <strong>
                        {getEntityName(
                          GAME_DATA.natures.find(
                            (n) => n.name === focusedStage.rating.worstCombination.natureName
                          ),
                          locale
                        )}
                      </strong>{' '}
                      | 食材槽: <strong>{focusedStage.rating.worstCombination.ingredientCombo}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {focusedStage.rating.worstCombination.subskillNames.map((s, i) => {
                        const subObj = GAME_DATA.subskills.find((x) => x.name === s);
                        return (
                          <span key={i} className="badge badge-white text-2xs">
                            {subObj ? getEntityName(subObj, locale) : s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">正在计算各等级阶段评估结果...</div>
            )}
          </div>
        </div>
      </div>

      {/* Specialty-Specific Deep-Dive Analysis Section */}
      {multiReport && focusedProd && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-5">
          {/* Specialty Deep-Dive Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <span>专项深度分析 (Lv.{focusedLevel} 焦点阶段 & 全阶段对比)</span>
                <span className={`badge badge-${species.specialty} text-2xs`}>
                  本宠专长：{species.specialty === 'berry' ? '树果型' : species.specialty === 'ingredient' ? '食材型' : species.specialty === 'skill' ? '技能型' : '全能型'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                自动展示对应专长的核心指标（树果总能量 / 食材效率与食谱覆盖率 / 技能触发次数与量化效果），也可切换查看副产出表现
              </p>
            </div>

            <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveDeepTab('berry')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors ${
                  activeDeepTab === 'berry'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                <span>树果与总能量分析</span>
                {species.specialty === 'berry' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeepTab('ingredient')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors ${
                  activeDeepTab === 'ingredient'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>食材效率与食谱覆盖</span>
                {species.specialty === 'ingredient' && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeepTab('skill')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer transition-colors ${
                  activeDeepTab === 'skill'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>技能触发与效果分析</span>
                {(species.specialty === 'skill' || species.specialty === 'all') && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>
            </div>
          </div>

          {/* ================= 1. SKILL SPECIALTY PANEL ================= */}
          {activeDeepTab === 'skill' && (
            <div className="space-y-5">
              {/* Skill Header & Trigger Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-start space-x-3">
                  <img
                    src={getSkillImageUrl(species.skill.image)}
                    alt=""
                    className="w-10 h-10 object-contain bg-white p-1.5 rounded-lg border border-indigo-100 shrink-0"
                  />
                  <div>
                    <div className="text-2xs font-semibold text-indigo-600">主技能与有效等级</div>
                    <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                      {species.skill.translations?.[locale] || species.skill.name}
                    </div>
                    <div className="text-xs font-bold text-indigo-700 mt-1">
                      有效 Lv.{focusedProd.effectiveMainSkillLevel} / {maxSkillLvl}
                      {focusedProd.skillLevelUpBonus > 0 && (
                        <span className="ml-1 text-2xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          副技能+{focusedProd.skillLevelUpBonus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">技能触发几率 (含保底)</div>
                  <div className="text-2xl font-black text-indigo-600 mt-1">
                    {(focusedProd.skillRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    基础 {(focusedProd.baseSkillRate * 100).toFixed(2)}% → 修正{' '}
                    {(focusedProd.skillRateWithoutPity * 100).toFixed(2)}% (保底 {species.pityProcThreshold} 次)
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    Lv.{focusedLevel} 每日期望触发次数
                  </div>
                  <div className="text-2xl font-black text-blue-600 mt-1">
                    {focusedProd.dailySkillProcs.toFixed(2)}{' '}
                    <span className="text-xs font-semibold text-slate-500">次 / 天</span>
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    日均帮忙 {focusedProd.dailyHelps.toFixed(1)} 次 (间隔 {focusedProd.helpingFrequency}s)
                  </div>
                </div>

                {(() => {
                  const unitMeta =
                    SKILL_UNIT_LABELS[focusedProd.skillActivationDetails.primaryUnit] || {
                      label: '技能每日总效果',
                      unitSuffix: '',
                    };
                  const det = focusedProd.skillActivationDetails;
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                      <div className="text-2xs font-semibold text-emerald-700">
                        {unitMeta.label} (Lv.{focusedProd.effectiveMainSkillLevel})
                      </div>
                      <div className="text-2xl font-black text-emerald-700 mt-1">
                        {det.dailyOutput.toFixed(1)}{' '}
                        <span className="text-xs font-semibold">{unitMeta.unitSuffix}/天</span>
                      </div>
                      <div className="text-2xs text-emerald-800 mt-1">
                        单次触发: {det.perProcOutput} {unitMeta.unitSuffix} | 折算{' '}
                        {Math.round(focusedProd.dailySkillEnergy).toLocaleString()} 能量/天
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Multi-Stage Skill Trigger & Effect Progression Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">养成阶段</th>
                      <th className="py-2.5 px-3">有效技能等级</th>
                      <th className="py-2.5 px-3">含保底触发率</th>
                      <th className="py-2.5 px-3">期望触发次数 / 天</th>
                      <th className="py-2.5 px-3">每日量化技能产出</th>
                      <th className="py-2.5 px-3">技能折算能量 / 天</th>
                      <th className="py-2.5 px-3">综合日总能量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multiReport.milestones.map((m) => {
                      const p = m.rating.currentProduction;
                      const det = p.skillActivationDetails;
                      const unitMeta = SKILL_UNIT_LABELS[det.primaryUnit] || {
                        label: '',
                        unitSuffix: '',
                      };
                      return (
                        <tr
                          key={m.level}
                          className={m.level === focusedLevel ? 'bg-indigo-50/40 font-semibold' : ''}
                        >
                          <td className="py-2 px-3 font-bold text-slate-800">
                            Lv.{m.level}{' '}
                            <span className="text-2xs text-slate-400 font-normal">({m.unlockNote})</span>
                          </td>
                          <td className="py-2 px-3">
                            Lv.{p.effectiveMainSkillLevel}
                            {p.skillLevelUpBonus > 0 && (
                              <span className="text-2xs text-amber-700 ml-1">
                                (+{p.skillLevelUpBonus})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">{(p.skillRate * 100).toFixed(2)}%</td>
                          <td className="py-2 px-3 font-bold text-indigo-600">
                            {p.dailySkillProcs.toFixed(2)} 次/天
                          </td>
                          <td className="py-2 px-3 text-emerald-700 font-semibold">
                            {det.dailyOutput.toFixed(1)} {unitMeta.unitSuffix}
                            {det.perProcTeamTotalOutput > 0 && (
                              <span className="text-2xs text-slate-500 ml-1">
                                (含队友 {det.dailyTeamTotalOutput.toFixed(1)})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {Math.round(p.dailySkillEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-bold text-blue-600">
                            {Math.round(p.totalDailyEnergy).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= 2. BERRY SPECIALTY PANEL ================= */}
          {activeDeepTab === 'berry' && berryComparison && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center space-x-3">
                  {berryObj && (
                    <img
                      src={getBerryImageUrl(berryObj.name)}
                      alt={berryObj.name}
                      className="w-10 h-10 object-contain bg-white p-1.5 rounded-lg border border-emerald-100 shrink-0"
                    />
                  )}
                  <div>
                    <div className="text-2xs font-semibold text-emerald-700">产果效率与属性</div>
                    <div className="font-extrabold text-sm text-slate-900 mt-0.5 flex items-center space-x-1">
                      <span>{getEntityName(berryObj, locale)}</span>
                      {species.type && (
                        <img
                          src={getTypeImageUrl(species.type)}
                          alt={species.type}
                          className="w-4 h-4 object-contain"
                        />
                      )}
                      <span className="text-xs text-slate-500">
                        ({getPokemonTypeLabel(species.type, locale)})
                      </span>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 mt-1">
                      每次掉落 {focusedProd.berriesPerDrop} 颗 | 日产 {focusedProd.dailyBerryCount.toFixed(1)} 颗
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-2xs font-semibold text-blue-700">
                    适性岛屿 (2×树果) 日总能量
                  </div>
                  <div className="text-2xl font-black text-blue-700 mt-1">
                    {Math.round(berryComparison.favored.totalDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    纯树果: {Math.round(berryComparison.favored.dailyBerryEnergy).toLocaleString()} / 天
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    非适性岛屿 (1×树果) 日总能量
                  </div>
                  <div className="text-2xl font-black text-slate-800 mt-1">
                    {Math.round(berryComparison.unfavored.totalDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    纯树果: {Math.round(berryComparison.unfavored.dailyBerryEnergy).toLocaleString()} / 天
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                  <div className="text-2xs font-semibold text-amber-800">
                    满包纯树果偷吃 (Sneaky Snacking)
                  </div>
                  <div className="text-2xl font-black text-amber-700 mt-1">
                    {Math.round(focusedProd.sneakySnackingDailyEnergy).toLocaleString()}
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    容量 {focusedProd.carryLimit} 格 (约 {focusedProd.hoursToFullCarry.toFixed(1)} 小时装满)
                  </div>
                </div>
              </div>

              {/* Multi-Stage Berry & Total Energy Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">养成阶段</th>
                      <th className="py-2.5 px-3">帮忙间隔</th>
                      <th className="py-2.5 px-3">单次树果数</th>
                      <th className="py-2.5 px-3">单颗树果能量</th>
                      <th className="py-2.5 px-3">日树果能量</th>
                      <th className="py-2.5 px-3">满包偷吃日能量</th>
                      <th className="py-2.5 px-3">日综合总能量 (树果+食材+技能)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multiReport.milestones.map((m) => {
                      const p = m.rating.currentProduction;
                      return (
                        <tr
                          key={m.level}
                          className={m.level === focusedLevel ? 'bg-emerald-50/40 font-semibold' : ''}
                        >
                          <td className="py-2 px-3 font-bold text-slate-800">Lv.{m.level}</td>
                          <td className="py-2 px-3">{p.helpingFrequency}s</td>
                          <td className="py-2 px-3">{p.berriesPerDrop} 颗/次</td>
                          <td className="py-2 px-3">{p.berryStrength}</td>
                          <td className="py-2 px-3 text-emerald-700 font-bold">
                            {Math.round(p.dailyBerryEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-amber-700">
                            {Math.round(p.sneakySnackingDailyEnergy).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-bold text-blue-600">
                            {Math.round(p.totalDailyEnergy).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= 3. INGREDIENT SPECIALTY & RECIPE COVERAGE PANEL ================= */}
          {activeDeepTab === 'ingredient' && focusedRecipeCoverage && (
            <div className="space-y-6">
              {/* Ingredient Acquisition Efficiency KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="text-2xs font-semibold text-amber-800">
                    Lv.{focusedLevel} 食材发现率
                  </div>
                  <div className="text-2xl font-black text-amber-700 mt-1">
                    {(focusedProd.ingredientRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    基础 {species.ingredientPercentage}% | 满包耗时 {focusedProd.hoursToFullCarry.toFixed(1)}h
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-2xs font-semibold text-slate-500">
                    Lv.{focusedLevel} 每日总食材产出
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {focusedProd.dailyIngredientCount.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">个 / 天</span>
                  </div>
                  <div className="text-2xs text-slate-500 mt-1">
                    直塞基础能量: {Math.round(focusedProd.dailyIngredientEnergy).toLocaleString()} / 天
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <div className="text-2xs font-semibold text-emerald-800">
                    三餐对应食材槽自给达标食谱
                  </div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">
                    {focusedRecipeCoverage.threeMealPartnerReadyCount}{' '}
                    <span className="text-xs font-normal text-emerald-700">
                      / {focusedRecipeCoverage.relevantRecipesTotal} 道关联菜肴
                    </span>
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    本宠所产食材日产量 ≥ 该食谱一日三餐总需求
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                  <div className="text-2xs font-semibold text-blue-800">单宠完全独揽食谱数</div>
                  <div className="text-2xl font-black text-blue-700 mt-1">
                    {focusedRecipeCoverage.soloCookable1MealCount} 道{' '}
                    <span className="text-xs font-normal text-slate-500">
                      (三餐独揽 {focusedRecipeCoverage.soloCookable3MealsCount} 道)
                    </span>
                  </div>
                  <div className="text-2xs text-slate-600 mt-1">
                    无需队友补充其他食材即可独立成菜
                  </div>
                </div>
              </div>

              {/* Multi-Stage Ingredient Daily Yield Breakdown */}
              <div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  各解锁阶段日均食材产出明细 (Lv.10 → Lv.30 → Lv.50 → Lv.60 → Lv.70)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {multiReport.milestones
                    .filter((m) => [10, 30, 50, 60, 70].includes(m.level))
                    .map((m) => {
                      const p = m.rating.currentProduction;
                      return (
                        <div
                          key={m.level}
                          onClick={() => setFocusedLevel(m.level)}
                          className={`p-3 rounded-xl border cursor-pointer ${
                            m.level === focusedLevel
                              ? 'bg-amber-50/60 border-amber-400'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                            <span>Lv.{m.level}</span>
                            <span className="text-2xs text-amber-700">
                              共 {p.dailyIngredientCount.toFixed(1)}/天
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {p.dailyIngredients.map((ing) => {
                              const ingObj = GAME_DATA.ingredients.find(
                                (i) => i.name.toLowerCase() === ing.ingredient.toLowerCase()
                              );
                              return (
                                <div
                                  key={ing.ingredient}
                                  className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-slate-100"
                                >
                                  <span className="inline-flex items-center space-x-1.5 truncate">
                                    <img
                                      src={getIngredientImageUrl(ing.ingredient)}
                                      alt={ing.ingredient}
                                      className="w-4 h-4 object-contain shrink-0"
                                    />
                                    <span className="truncate">
                                      {ingObj ? getEntityName(ingObj, locale) : ing.ingredient}
                                    </span>
                                  </span>
                                  <span className="font-bold text-amber-800 ml-1">
                                    {ing.amount.toFixed(1)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Recipe Coverage & 3-Meals Compatibility Matrix */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Lv.{focusedLevel} 核心适配食谱与一日三餐覆盖率分析</span>
                  </div>

                  <div className="flex space-x-1.5">
                    {(
                      [
                        { id: 'curry' as const, label: getUIText('curry', locale) },
                        { id: 'salad' as const, label: getUIText('salad', locale) },
                        { id: 'dessert' as const, label: getUIText('dessert', locale) },
                      ]
                    ).map((tab) => {
                      const stat = focusedRecipeCoverage.byType[tab.id];
                      return (
                        <button
                          type="button"
                          key={tab.id}
                          onClick={() => setRecipeDishTab(tab.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                            recipeDishTab === tab.id
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {tab.label} ({stat.threeMealReadyCount}/{stat.relevantCount})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {focusedRecipeCoverage.byType[recipeDishTab].topDishes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    本宝可梦在 Lv.{focusedLevel} 产出的食材暂不匹配该类别食谱。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {focusedRecipeCoverage.byType[recipeDishTab].topDishes.map((match) => {
                      const r = match.recipe;
                      return (
                        <div
                          key={r.name}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                            match.threeMealSelfSufficientForMatched
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div>
                            {/* Recipe Sprite + Title */}
                            <div className="flex items-start space-x-2.5">
                              <img
                                src={getRecipeImageUrl(r.name)}
                                alt={r.displayName}
                                loading="lazy"
                                className="w-11 h-11 object-contain bg-slate-50 rounded-lg p-1 border border-slate-100 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-slate-900 truncate">
                                  {getEntityName(r, locale)}
                                </div>
                                <div className="text-2xs text-slate-500 mt-0.5">
                                  基础能量 {r.value.toLocaleString()} | 共 {r.nrOfIngredients} 食材
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {match.isSoloCookable3Meals ? (
                                    <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                      单宠三餐全包
                                    </span>
                                  ) : match.threeMealSelfSufficientForMatched ? (
                                    <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      本宠负责槽位三餐达标 ({match.mealsPerDayForMatched}餐/天)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                      可支撑 {match.mealsPerDayForMatched} 餐/天 (三餐覆盖 {match.totalMatchedDailyRatio}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* All Recipe Ingredients (highlighting matched vs partner slots) */}
                            <div className="mt-3 space-y-1.5">
                              {r.ingredients.map((req) => {
                                const mItem = match.matchedIngredients.find(
                                  (mi) => mi.ingredient.toLowerCase() === req.ingredient.toLowerCase()
                                );
                                const ingObj = GAME_DATA.ingredients.find(
                                  (i) => i.name.toLowerCase() === req.ingredient.toLowerCase()
                                );
                                return (
                                  <div key={req.ingredient} className="text-2xs">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center space-x-1">
                                        <img
                                          src={getIngredientImageUrl(req.ingredient)}
                                          alt={req.ingredient}
                                          className="w-3.5 h-3.5 object-contain"
                                        />
                                        <span className={mItem ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                                          {ingObj ? getEntityName(ingObj, locale) : req.ingredient} ×{req.amount}/餐
                                        </span>
                                      </span>
                                      {mItem ? (
                                        <span
                                          className={`font-bold ${
                                            mItem.threeMealCoveragePct >= 100
                                              ? 'text-emerald-700'
                                              : 'text-amber-700'
                                          }`}
                                        >
                                          日产 {mItem.dailyProduced} / 三餐需 {mItem.threeMealRequired}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">需队友搭配 (三餐 {req.amount * 3})</span>
                                      )}
                                    </div>
                                    {mItem && (
                                      <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                                        <div
                                          className={`h-full rounded-full ${
                                            mItem.threeMealCoveragePct >= 100
                                              ? 'bg-emerald-500'
                                              : 'bg-amber-500'
                                          }`}
                                          style={{ width: `${Math.min(100, mItem.threeMealCoveragePct)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
