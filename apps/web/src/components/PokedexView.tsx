import React, { useState } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { getEntityName, getUIText } from '../i18n';
import { BookOpen, Search, ShieldCheck, Heart, Award } from 'lucide-react';

interface PokedexViewProps {
  locale: SupportedLocale;
}

export const PokedexView: React.FC<PokedexViewProps> = ({ locale }) => {
  const [activeTab, setActiveTab] = useState<'pokemon' | 'recipes' | 'attribution'>('pokemon');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPokemon = GAME_DATA.pokemon.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = getEntityName(p, locale).toLowerCase();
    return name.includes(q) || p.pokedexNumber.toString() === q || p.name.toLowerCase().includes(q);
  });

  const filteredRecipes = GAME_DATA.recipes.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = getEntityName(r, locale).toLowerCase();
    return name.includes(q) || r.type.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Sub tabs */}
      <div className="flex space-x-2 bg-white p-2 rounded-xl border border-slate-200">
        <button
          onClick={() => setActiveTab('pokemon')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer ${
            activeTab === 'pokemon'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          宝可梦图鉴 ({GAME_DATA.pokemon.length})
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer ${
            activeTab === 'recipes'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          食谱大全 ({GAME_DATA.recipes.length})
        </button>
        <button
          onClick={() => setActiveTab('attribution')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer ${
            activeTab === 'attribution'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          开源致谢与声明
        </button>
      </div>

      {/* Pokemon Tab */}
      {activeTab === 'pokemon' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索宝可梦名字或图鉴编号..."
              className="input-field pl-9"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPokemon.map((p) => (
              <div key={p.name} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      {getEntityName(p, locale)}
                    </h3>
                    <span className="text-2xs text-slate-400">
                      #{p.pokedexNumber} | {p.name}
                    </span>
                  </div>
                  <span className={`badge badge-${p.specialty}`}>
                    {p.specialty}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3 bg-slate-50 p-2 rounded-lg">
                  <div>
                    <span className="block text-slate-400 text-2xs">基础间隔</span>
                    <span className="font-bold text-slate-700">{p.frequency}s</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 text-2xs">携带上限</span>
                    <span className="font-bold text-slate-700">{p.carrySize}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 text-2xs">树果</span>
                    <span className="font-bold text-emerald-600">{p.berry}</span>
                  </div>
                </div>

                <div className="mt-3 text-xs">
                  <span className="text-2xs font-semibold text-slate-500 block mb-1">
                    候选食材池:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...(p.ingredient0 || []),
                      ...(p.ingredient30 || []),
                      ...(p.ingredient60 || []),
                    ].map((item, idx) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                      );
                      return (
                        <span key={idx} className="badge badge-white text-2xs">
                          {ingObj ? getEntityName(ingObj, locale) : item.ingredient} x{item.amount}
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

      {/* Recipes Tab */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索食谱名字或分类..."
              className="input-field pl-9"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecipes.map((r) => (
              <div key={r.name} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      {getEntityName(r, locale)}
                    </h3>
                    <span className="text-2xs text-slate-400">
                      {r.type.toUpperCase()} | 基础能量: {r.value} (Lv.70: {r.valueMax})
                    </span>
                  </div>
                  <span className="badge badge-ingredient">+{r.bonus}%</span>
                </div>

                <div className="mt-3 text-xs">
                  <span className="text-2xs font-semibold text-slate-500 block mb-1">
                    所需食材 ({r.nrOfIngredients} 个):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {r.ingredients.map((ing, idx) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === ing.ingredient.toLowerCase()
                      );
                      return (
                        <span key={idx} className="badge badge-white text-2xs">
                          {ingObj ? getEntityName(ingObj, locale) : ing.ingredient} x{ing.amount}
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
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
          <div className="flex items-center space-x-2 pb-4 border-b border-slate-100">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {getUIText('attributionTitle', locale)}
            </h2>
          </div>

          <div className="prose prose-slate text-sm max-w-none space-y-4">
            <p className="text-slate-600">
              本工具严格遵守开源与知识产权合规准则，不包含任何对 Pokémon Sleep 客户端的非法逆向工程或网络封包拦截，所有游戏基础数值与多语言数据均基于公开社区研究成果与合规开源协议：
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
                  提供宝可梦基础面板、副技能、性格、树果、食材、食谱等级加成公式（Lv1–70）、技能保底阈值与晚安缎带数值模型。
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
                  Community Research Data
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  提供副技能金/银/白抽取概率、食材槽位抽取概率、隐藏食材几率与技能发动几率反推模型及 Rate my Pokémon 理论参考。
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
                  针对 Pokémon Sleep 特有的 17 种副技能、19 种食材、78 道食谱与主技能对照游戏官方文本自建的完整四语词典及别名库。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

