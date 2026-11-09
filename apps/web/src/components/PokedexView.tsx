import React, { useState, useMemo } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getPokemonImageUrl,
  getTypeImageUrl,
  getBerryImageUrl,
  getIngredientImageUrl,
  getRecipeImageUrl,
  getSkillImageUrl,
} from '@pokesleep/data';
import { getEntityName, getPokemonTypeLabel, getUIText } from '../i18n';
import { BookOpen, Search, ShieldCheck, Heart, Award, RotateCcw } from 'lucide-react';

interface PokedexViewProps {
  locale: SupportedLocale;
}

const ALL_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const PokedexView: React.FC<PokedexViewProps> = ({ locale }) => {
  const [activeTab, setActiveTab] = useState<'pokemon' | 'recipes' | 'attribution'>('pokemon');
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ingredientFilter, setIngredientFilter] = useState<string>('all');
  const [recipeTypeFilter, setRecipeTypeFilter] = useState<'all' | 'curry' | 'salad' | 'dessert'>('all');

  const filteredPokemon = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GAME_DATA.pokemon.filter((p) => {
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (typeFilter !== 'all' && p.type?.toLowerCase() !== typeFilter) return false;
      if (ingredientFilter !== 'all') {
        const allIngs = [
          ...(p.ingredient0 || []),
          ...(p.ingredient30 || []),
          ...(p.ingredient60 || []),
        ];
        if (!allIngs.some((s) => s.ingredient.toLowerCase() === ingredientFilter.toLowerCase())) {
          return false;
        }
      }
      if (q) {
        const name = getEntityName(p, locale).toLowerCase();
        return (
          name.includes(q) ||
          p.pokedexNumber.toString() === q ||
          p.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [searchQuery, specialtyFilter, typeFilter, ingredientFilter, locale]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GAME_DATA.recipes.filter((r) => {
      if (recipeTypeFilter !== 'all' && r.type !== recipeTypeFilter) return false;
      if (ingredientFilter !== 'all') {
        if (!r.ingredients.some((i) => i.ingredient.toLowerCase() === ingredientFilter.toLowerCase())) {
          return false;
        }
      }
      if (q) {
        const name = getEntityName(r, locale).toLowerCase();
        return name.includes(q) || r.type.toLowerCase().includes(q);
      }
      return true;
    });
  }, [searchQuery, recipeTypeFilter, ingredientFilter, locale]);

  return (
    <div className="space-y-6">
      {/* Sub tabs */}
      <div className="flex space-x-1.5 sm:space-x-2 bg-white p-1.5 sm:p-2 rounded-xl border border-slate-200">
        <button
          onClick={() => setActiveTab('pokemon')}
          className={`flex-1 py-2 px-1 text-2xs sm:text-xs font-bold rounded-lg cursor-pointer tap-feedback text-center transition-colors ${
            activeTab === 'pokemon'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          宝可梦图鉴 ({GAME_DATA.pokemon.length})
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex-1 py-2 px-1 text-2xs sm:text-xs font-bold rounded-lg cursor-pointer tap-feedback text-center transition-colors ${
            activeTab === 'recipes'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          食谱大全 ({GAME_DATA.recipes.length})
        </button>
        <button
          onClick={() => setActiveTab('attribution')}
          className={`flex-1 py-2 px-1 text-2xs sm:text-xs font-bold rounded-lg cursor-pointer tap-feedback text-center transition-colors ${
            activeTab === 'attribution'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          开源致谢
        </button>
      </div>

      {/* Pokemon Tab */}
      {activeTab === 'pokemon' && (
        <div className="space-y-4">
          {/* Multi-Dimensional Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索宝可梦名字或图鉴编号..."
                  className="input-field pl-9 text-xs py-1.5"
                />
              </div>

              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="input-field text-xs py-1.5 w-auto"
              >
                <option value="all">{getUIText('filterAll', locale)}</option>
                <option value="berry">{getUIText('filterBerry', locale)}</option>
                <option value="ingredient">{getUIText('filterIngredient', locale)}</option>
                <option value="skill">{getUIText('filterSkill', locale)}</option>
                <option value="all">全能型</option>
              </select>

              <select
                value={ingredientFilter}
                onChange={(e) => setIngredientFilter(e.target.value)}
                className="input-field text-xs py-1.5 w-auto"
              >
                <option value="all">全部候选食材</option>
                {GAME_DATA.ingredients.map((ing) => (
                  <option key={ing.name} value={ing.name}>
                    可产 {getEntityName(ing, locale)}
                  </option>
                ))}
              </select>

              {(searchQuery || specialtyFilter !== 'all' || typeFilter !== 'all' || ingredientFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSpecialtyFilter('all');
                    setTypeFilter('all');
                    setIngredientFilter('all');
                  }}
                  className="btn btn-secondary text-xs py-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  重置筛选
                </button>
              )}
            </div>

            {/* Type Icons Strip */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2 py-0.5 rounded text-2xs font-semibold border cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                全部属性
              </button>
              {ALL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                  className={`px-2 py-0.5 rounded text-2xs border inline-flex items-center space-x-1 cursor-pointer ${
                    typeFilter === t
                      ? 'bg-blue-100 border-blue-500 text-blue-900 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <img src={getTypeImageUrl(t)} alt={t} className="w-3.5 h-3.5 object-contain" />
                  <span>{getPokemonTypeLabel(t, locale)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPokemon.map((p) => {
              const berryObj = GAME_DATA.berries.find(
                (b) => b.name.toUpperCase() === p.berry.toUpperCase()
              );
              const uniqueIngSlots = new Map<string, number[]>();
              for (const s of [...(p.ingredient0 || []), ...(p.ingredient30 || []), ...(p.ingredient60 || [])]) {
                if (s.ingredient === 'Locked') continue;
                const arr = uniqueIngSlots.get(s.ingredient) || [];
                if (!arr.includes(s.amount)) arr.push(s.amount);
                uniqueIngSlots.set(s.ingredient, arr);
              }

              return (
                <div key={p.name} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="relative shrink-0">
                        <img
                          src={getPokemonImageUrl(p.name)}
                          alt={p.displayName}
                          loading="lazy"
                          className="w-14 h-14 object-contain bg-slate-50 rounded-xl p-1 border border-slate-100"
                        />
                        {p.type && (
                          <img
                            src={getTypeImageUrl(p.type)}
                            alt={p.type}
                            className="w-4 h-4 object-contain absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-2xs"
                          />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">
                          {getEntityName(p, locale)}
                        </h3>
                        <span className="text-2xs text-slate-400">
                          #{p.pokedexNumber} | {getPokemonTypeLabel(p.type, locale)}属性
                        </span>
                      </div>
                    </div>
                    <span className={`badge badge-${p.specialty}`}>
                      {p.specialty === 'berry'
                        ? '树果'
                        : p.specialty === 'ingredient'
                          ? '食材'
                          : p.specialty === 'skill'
                            ? '技能'
                            : '全能'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3 bg-slate-50 p-2 rounded-lg">
                    <div>
                      <span className="block text-slate-400 text-2xs">基础间隔</span>
                      <span className="font-bold text-slate-700">{p.frequency}s</span>
                    </div>
                    <div>
                      <span className="block text-slate-400 text-2xs">食材率/技能率</span>
                      <span className="font-bold text-slate-700">
                        {p.ingredientPercentage}% / {p.skillPercentage}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400 text-2xs">专属树果</span>
                      <span className="font-bold text-emerald-700 inline-flex items-center justify-center space-x-1">
                        {berryObj && (
                          <img
                            src={getBerryImageUrl(berryObj.name)}
                            alt={berryObj.name}
                            className="w-3.5 h-3.5 object-contain"
                          />
                        )}
                        <span className="truncate">{getEntityName(berryObj, locale)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Main Skill */}
                  <div className="mt-2.5 text-2xs text-indigo-700 bg-indigo-50/50 px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5">
                    <img
                      src={getSkillImageUrl(p.skill.image)}
                      alt=""
                      className="w-4 h-4 object-contain shrink-0"
                    />
                    <span className="font-semibold truncate">
                      主技能：{p.skill.translations?.[locale] || p.skill.name}
                    </span>
                  </div>

                  {/* Candidate Ingredients */}
                  <div className="mt-2.5 text-xs">
                    <span className="text-2xs font-semibold text-slate-500 block mb-1">
                      候选食材池:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(uniqueIngSlots.entries()).map(([ingName, amounts]) => {
                        const ingObj = GAME_DATA.ingredients.find(
                          (i) => i.name.toLowerCase() === ingName.toLowerCase()
                        );
                        return (
                          <span
                            key={ingName}
                            className="px-2 py-0.5 rounded-md bg-amber-50/70 border border-amber-200 text-amber-900 text-2xs inline-flex items-center space-x-1"
                          >
                            <img
                              src={getIngredientImageUrl(ingName)}
                              alt={ingName}
                              className="w-3.5 h-3.5 object-contain"
                            />
                            <span>
                              {ingObj ? getEntityName(ingObj, locale) : ingName} ({amounts.join('/')})
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipes Tab */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索食谱名字..."
                className="input-field pl-9 text-xs py-1.5"
              />
            </div>

            <div className="flex space-x-1">
              {(
                [
                  { id: 'all' as const, label: '全部料理' },
                  { id: 'curry' as const, label: getUIText('curry', locale) },
                  { id: 'salad' as const, label: getUIText('salad', locale) },
                  { id: 'dessert' as const, label: getUIText('dessert', locale) },
                ]
              ).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setRecipeTypeFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    recipeTypeFilter === cat.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <select
              value={ingredientFilter}
              onChange={(e) => setIngredientFilter(e.target.value)}
              className="input-field text-xs py-1.5 w-auto"
            >
              <option value="all">全部食材筛选</option>
              {GAME_DATA.ingredients.map((ing) => (
                <option key={ing.name} value={ing.name}>
                  使用 {getEntityName(ing, locale)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecipes.map((r) => (
              <div key={r.name} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <img
                      src={getRecipeImageUrl(r.name)}
                      alt={r.displayName}
                      loading="lazy"
                      className="w-12 h-12 object-contain bg-slate-50 rounded-xl p-1 border border-slate-100 shrink-0"
                    />
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        {getEntityName(r, locale)}
                      </h3>
                      <span className="text-2xs text-slate-500">
                        基础 {r.value.toLocaleString()} | 满级 {r.valueMax.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-ingredient shrink-0">+{r.bonus}%</span>
                </div>

                <div className="mt-3 text-xs">
                  <span className="text-2xs font-semibold text-slate-500 block mb-1">
                    所需食材 (共 {r.nrOfIngredients} 个):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {r.ingredients.map((ing, idx) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === ing.ingredient.toLowerCase()
                      );
                      return (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-2xs inline-flex items-center space-x-1"
                        >
                          <img
                            src={getIngredientImageUrl(ing.ingredient)}
                            alt={ing.ingredient}
                            className="w-3.5 h-3.5 object-contain"
                          />
                          <span>
                            {ingObj ? getEntityName(ingObj, locale) : ing.ingredient} ×{ing.amount}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attribution Tab */}
      {activeTab === 'attribution' && (
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 space-y-6">
          <div className="flex items-center space-x-2 pb-4 border-b border-slate-100">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {getUIText('attributionTitle', locale)}
            </h2>
          </div>

          <div className="prose prose-slate text-sm max-w-none space-y-4">
            <p className="text-slate-600">
              本工具用于个人非商业游戏辅助研究，所有基础数值、计算公式与多语言词库基于以下公开社区研究成果与开源协议构建：
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose mt-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-800 flex items-center">
                  <Award className="w-4 h-4 mr-1 text-blue-600" />
                  Neroli's Lab
                </div>
                <div className="text-2xs text-slate-500 font-mono mt-0.5">
                  License: Apache-2.0
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  提供宝可梦基础面板、主副技能激活系数、性格、树果、食材、食谱等级加成公式（Lv1–70）、SP 公式、技能保底阈值与图标素材整理。
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-800 flex items-center">
                  <Award className="w-4 h-4 mr-1 text-blue-600" />
                  PokéAPI (PokeAPI/pokeapi)
                </div>
                <div className="text-2xs text-slate-500 font-mono mt-0.5">
                  License: BSD-3-Clause
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  提供宝可梦物种名称、性格名称与树果名称的多语言（简中/繁中/日文/英文）官方译名映射。
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-800 flex items-center">
                  <Heart className="w-4 h-4 mr-1 text-rose-500" />
                  Mathcord & RaenonX Community
                </div>
                <div className="text-2xs text-slate-500 font-mono mt-0.5">
                  Community Research & Cross-Validation Reference
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  提供副技能金/银/白抽取概率、食材槽抽取分布、技能保底期望触发率反推模型与交叉验证基准对照。
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-800 flex items-center">
                  <BookOpen className="w-4 h-4 mr-1 text-amber-500" />
                  PokéSleep Assistant 专属词库
                </div>
                <div className="text-2xs text-slate-500 font-mono mt-0.5">
                  Copyright © 2026 PokéSleep Assistant Team
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  针对 Pokémon Sleep 特有的 17 种副技能、19 种食材、78 道食谱与 35 种主技能（含专属衍生技能）对照官方译名构建四语词典及 OCR 别名库。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
