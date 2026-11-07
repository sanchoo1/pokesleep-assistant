import React, { useState, useMemo } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getPokemonImageUrl,
  getIngredientImageUrl,
  getRecipeImageUrl,
} from '@pokesleep/data';
import {
  calculateDailyProduction,
  recommendSingleMeal,
} from '@pokesleep/engine';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getUIText } from '../i18n';
import {
  ChefHat,
  Flame,
  Utensils,
  Calendar,
  Sparkles,
  Loader2,
  CheckCircle,
} from 'lucide-react';

interface TeamAndCookingViewProps {
  teamPokemon: BoxPokemon[];
  locale: SupportedLocale;
  onRemoveFromTeam: (pokemon: BoxPokemon) => void;
}

export const TeamAndCookingView: React.FC<TeamAndCookingViewProps> = ({
  teamPokemon,
  locale,
  onRemoveFromTeam,
}) => {
  const [mealCategory, setMealCategory] = useState<'curry' | 'salad' | 'dessert'>('curry');
  const [potSize, setPotSize] = useState(57);
  const [goodCampTicket, setGoodCampTicket] = useState(false);
  const [islandBonus, setIslandBonus] = useState(20);

  const [inventory, setInventory] = useState<Record<string, number>>({
    Apple: 40,
    Sausage: 30,
    Ginger: 25,
    Milk: 20,
    Honey: 20,
    Tomato: 15,
    Egg: 15,
    Herb: 15,
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState<any | null>(null);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);

  // Calculate team energy & daily ingredient production (including Lv.70 subskills & mainSkillLevel!)
  const teamAnalysis = useMemo(() => {
    let totalEnergy = 0;
    let berryEnergy = 0;
    let ingredientEnergy = 0;
    let skillEnergy = 0;
    const dailyIngs: Record<string, number> = {};
    const memberProds: Record<string, ReturnType<typeof calculateDailyProduction>> = {};

    for (const p of teamPokemon) {
      try {
        const sp = GAME_DATA.pokemon.find(
          (s) => s.name.toUpperCase() === p.pokemonName.toUpperCase()
        );
        const prod = calculateDailyProduction({
          pokemon: p.pokemonName,
          level: p.level,
          nature: p.nature,
          subskills: normalizeBoxSubskills(p.subskills),
          ingredientSelection: {
            slot0: p.ingredients.slotA,
            slot30: p.ingredients.slotB,
            slot60: p.ingredients.slotC,
          },
          mainSkillLevel: p.mainSkillLevel || 1 + (sp?.previousEvolutions || 0),
          ribbonLevel: p.ribbonLevel || 0,
          goodCampTicket,
          mapBonus: islandBonus,
        });

        memberProds[p.id] = prod;
        totalEnergy += prod.totalDailyEnergy;
        berryEnergy += prod.dailyBerryEnergy;
        ingredientEnergy += prod.dailyIngredientEnergy;
        skillEnergy += prod.dailySkillEnergy;

        for (const ing of prod.combinedDailyIngredients || prod.dailyIngredients) {
          dailyIngs[ing.ingredient] = (dailyIngs[ing.ingredient] || 0) + ing.amount;
        }
      } catch {
        // ignore
      }
    }

    return {
      totalEnergy,
      berryEnergy,
      ingredientEnergy,
      skillEnergy,
      dailyIngredients: dailyIngs,
      memberProds,
    };
  }, [teamPokemon, goodCampTicket, islandBonus]);

  const r1Recommendation = useMemo(() => {
    const effectivePot = Math.floor(potSize * (goodCampTicket ? 1.5 : 1.0));
    const recs = recommendSingleMeal({
      recipeType: mealCategory,
      potCapacity: effectivePot,
      inventory,
      mapBonus: islandBonus,
    });
    return recs.length > 0 ? recs[0] : null;
  }, [mealCategory, potSize, goodCampTicket, inventory, islandBonus]);

  const handleRunWeeklyLPOptimizer = async () => {
    setIsOptimizing(true);
    setOptimizerError(null);
    try {
      const payload = {
        mealCategory,
        basePotCapacity: potSize,
        hasGoodCampTicket: goodCampTicket,
        currentInventory: inventory,
        dailyProduction: teamAnalysis.dailyIngredients,
        islandBonus,
        fillPotWithLeftovers: true,
        weekdayCritMultiplier: 1.0,
        sundayCritMultiplier: 2.0,
      };

      const res = await fetch('/api/optimize/weekly-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const plan = await res.json();
      setWeeklyPlan(plan);
    } catch {
      setOptimizerError(
        '连接 Python 优化器后端微服务失败（请确保 `uvicorn main:app` 在 8000 端口运行）。'
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Team Bar */}
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">
              {getUIText('activeTeam', locale)} ({teamPokemon.length}/5)
            </h2>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 block">
              {getUIText('teamEnergyTitle', locale)}
            </span>
            <span className="text-2xl font-black text-blue-600">
              {Math.round(teamAnalysis.totalEnergy).toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">/ 天</span>
            </span>
          </div>
        </div>

        {/* Team Members with Official Sprites */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          {teamPokemon.length === 0 ? (
            <div className="col-span-full py-8 text-center text-slate-400 text-xs">
              队伍当前为空，请前往「宝可梦盒」点击卡片右上角的「+」号将宝可梦加入出阵队伍！
            </div>
          ) : (
            teamPokemon.map((pkmn) => {
              const sp = GAME_DATA.pokemon.find(
                (p) => p.name.toUpperCase() === pkmn.pokemonName.toUpperCase()
              );
              const prod = teamAnalysis.memberProds[pkmn.id];
              return (
                <div
                  key={pkmn.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl relative flex flex-col items-center text-center"
                >
                  <button
                    onClick={() => onRemoveFromTeam(pkmn)}
                    className="absolute top-2 right-2 text-slate-400 hover:text-red-500 text-xs cursor-pointer"
                    title="从队伍移除"
                  >
                    ✕
                  </button>
                  {sp && (
                    <img
                      src={getPokemonImageUrl(sp.name)}
                      alt={sp.displayName}
                      className="w-12 h-12 object-contain mb-1"
                    />
                  )}
                  <div className="font-bold text-xs text-slate-800 truncate max-w-full">
                    {getEntityName(sp, locale)}
                  </div>
                  <div className="text-2xs text-slate-500 mt-0.5">Lv.{pkmn.level}</div>
                  {prod && (
                    <div className="text-xs font-bold text-blue-600 mt-1.5">
                      {Math.round(prod.totalDailyEnergy).toLocaleString()} 能量/天
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Energy Breakdown */}
        {teamPokemon.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-center text-xs">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
              <span className="block font-semibold">树果能量</span>
              <span className="font-bold">{Math.round(teamAnalysis.berryEnergy).toLocaleString()}</span>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
              <span className="block font-semibold">食材能量</span>
              <span className="font-bold">{Math.round(teamAnalysis.ingredientEnergy).toLocaleString()}</span>
            </div>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-100">
              <span className="block font-semibold">技能能量</span>
              <span className="font-bold">{Math.round(teamAnalysis.skillEnergy).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Daily Ingredient Output with Official Icons */}
      {teamPokemon.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-3 flex items-center">
            <Utensils className="w-4 h-4 mr-1 text-amber-500" />
            {getUIText('dailyIngredientsTitle', locale)}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(teamAnalysis.dailyIngredients).map(([name, qty]) => {
              const ingObj = GAME_DATA.ingredients.find(
                (i) => i.name.toLowerCase() === name.toLowerCase()
              );
              return (
                <div
                  key={name}
                  className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs flex items-center space-x-2"
                >
                  <img
                    src={getIngredientImageUrl(name)}
                    alt={name}
                    className="w-4 h-4 object-contain"
                  />
                  <span className="font-medium text-slate-700">
                    {ingObj ? getEntityName(ingObj, locale) : name}
                  </span>
                  <span className="font-bold text-amber-800">+{qty.toFixed(1)} /天</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* R1 Single Meal Recommendation & R2 Weekly LP Planner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Meal Settings & Inventory */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
            <ChefHat className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">料理与食材背包配置</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {getUIText('mealCategory', locale)}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['curry', 'salad', 'dessert'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMealCategory(cat)}
                  className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                    mealCategory === cat
                      ? 'bg-blue-50 border-blue-600 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {getUIText(cat, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {getUIText('potSize', locale)}
              </label>
              <input
                type="number"
                min={15}
                max={200}
                value={potSize}
                onChange={(e) => setPotSize(Number(e.target.value))}
                className="input-field text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {getUIText('islandBonus', locale)} (%)
              </label>
              <input
                type="number"
                min={0}
                max={85}
                value={islandBonus}
                onChange={(e) => setIslandBonus(Number(e.target.value))}
                className="input-field text-xs"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="gct"
              checked={goodCampTicket}
              onChange={(e) => setGoodCampTicket(e.target.checked)}
              className="rounded text-blue-600"
            />
            <label htmlFor="gct" className="text-xs font-medium text-slate-700 cursor-pointer">
              {getUIText('goodCampTicket', locale)} (锅容量 ×1.5)
            </label>
          </div>

          {/* Editable Ingredient Bag with Icons */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              当前背包食材库存
            </label>
            <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {GAME_DATA.ingredients.map((ing) => (
                <div
                  key={ing.name}
                  className="flex items-center space-x-1 p-1 rounded border border-slate-200 bg-slate-50"
                >
                  <img
                    src={getIngredientImageUrl(ing.name)}
                    alt={ing.name}
                    title={getEntityName(ing, locale)}
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={inventory[ing.name] || 0}
                    onChange={(e) =>
                      setInventory({
                        ...inventory,
                        [ing.name]: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-0.5 text-center"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleRunWeeklyLPOptimizer}
            disabled={isOptimizing}
            className="btn btn-primary w-full text-xs font-semibold py-2.5 mt-2"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {getUIText('optimizing', locale)}
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                {getUIText('runLPOptimizer', locale)}
              </>
            )}
          </button>

          {optimizerError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
              {optimizerError}
            </div>
          )}
        </div>

        {/* Right Columns: R1 Best Meal & R2 Schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* R1 Card */}
          <div className="card p-6 border-l-4 border-l-blue-600">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {getUIText('r1RecommendationTitle', locale)}
                </h3>
              </div>
              {r1Recommendation && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-bold">
                  本餐能量: {r1Recommendation.totalMealStrength.toLocaleString()}
                </span>
              )}
            </div>

            {r1Recommendation ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={getRecipeImageUrl(r1Recommendation.recipe.name)}
                    alt={r1Recommendation.recipe.displayName}
                    className="w-14 h-14 object-contain bg-slate-50 rounded-xl p-1 border border-slate-100 shrink-0"
                  />
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">
                      {getEntityName(r1Recommendation.recipe, locale)}
                    </h4>
                    <span className="text-xs text-slate-500">
                      食谱基础强度: {r1Recommendation.recipeStrengthAtLevel.toLocaleString()} | 食谱等级: Lv.{r1Recommendation.recipeLevel}
                    </span>
                  </div>
                </div>

                {r1Recommendation.fillerIngredients.length > 0 && (
                  <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-600 font-semibold block mb-1">
                      贪心填充食材 (+{r1Recommendation.fillerStrength.toLocaleString()} 能量):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {r1Recommendation.fillerIngredients.map((f: any, i: number) => {
                        const ingObj = GAME_DATA.ingredients.find(
                          (ing) => ing.name.toLowerCase() === f.ingredient.toLowerCase()
                        );
                        return (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-white border border-slate-200 text-2xs inline-flex items-center space-x-1"
                          >
                            <img
                              src={getIngredientImageUrl(f.ingredient)}
                              alt={f.ingredient}
                              className="w-3.5 h-3.5 object-contain"
                            />
                            <span>
                              {ingObj ? getEntityName(ingObj, locale) : f.ingredient} ×{f.amount}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                当前库存不足以烹饪本类别食谱，请在左侧调整库存或生产。
              </div>
            )}
          </div>

          {/* R2 LP Plan Results Table */}
          {weeklyPlan && (
            <div className="card p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    {getUIText('r2OptimizerTitle', locale)}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">求解耗时 {weeklyPlan.solveTimeMs}ms</span>
                  <span className="text-xl font-black text-emerald-600">
                    周总料理能量: {Math.round(weeklyPlan.totalStrength).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {weeklyPlan.schedule.map((meal: any) => (
                  <div
                    key={meal.mealIndex}
                    className={`p-2.5 rounded-lg text-xs flex items-center justify-between border ${
                      meal.day === 'Sunday'
                        ? 'bg-amber-50/70 border-amber-300 font-medium'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-slate-500 w-16">
                        {meal.day.substring(0, 3)} {meal.mealName.substring(0, 1)}
                      </span>
                      {meal.recipeName && meal.recipeName !== 'MIXED_DISH' && (
                        <img
                          src={getRecipeImageUrl(meal.recipeName)}
                          alt=""
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <span className="font-extrabold text-slate-900">
                        {meal.displayName || '自由烹饪/填充'}
                      </span>
                      {meal.day === 'Sunday' && (
                        <span className="badge badge-gold text-2xs">周日锅容量×2 & 大成功</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-slate-500">锅容量: {meal.potCapacity}</span>
                      <span className="font-bold text-blue-600">
                        {Math.round(meal.finalStrength).toLocaleString()} 能量
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
