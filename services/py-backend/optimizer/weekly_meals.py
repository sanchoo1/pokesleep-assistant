"""Weekly Meal Optimization Solver using Mixed-Integer Linear Programming (HiGHS / SciPy)."""

import math
import time
from typing import Any, Dict, List, Optional
import numpy as np
from pydantic import BaseModel, Field
from scipy.optimize import LinearConstraint, milp
from scipy.sparse import csc_matrix

from data_loader import DATA_LOADER

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MEAL_NAMES = ["Breakfast", "Lunch", "Dinner"]


class WeeklyMealRequest(BaseModel):
    mealCategory: str = Field(..., description="curry, salad, dessert, or all")
    basePotCapacity: int = Field(57, ge=15, le=200)
    hasGoodCampTicket: bool = False
    currentInventory: Dict[str, int] = Field(default_factory=dict)
    dailyProduction: Dict[str, float] = Field(default_factory=dict)
    recipeLevels: Dict[str, int] = Field(default_factory=dict)
    islandBonus: float = Field(0.0, ge=0.0, le=85.0)
    fillPotWithLeftovers: bool = True
    weekdayCritMultiplier: float = Field(1.0, ge=1.0, le=3.0)
    sundayCritMultiplier: float = Field(2.0, ge=1.0, le=3.0)


class MealFillerItem(BaseModel):
    ingredient: str
    displayName: str
    amount: int
    value: int


class ScheduledMeal(BaseModel):
    mealIndex: int  # 1 to 21
    day: str
    dayIndex: int  # 1 to 7
    mealName: str  # Breakfast, Lunch, Dinner
    recipeName: Optional[str] = None
    displayName: Optional[str] = None
    recipeLevel: int = 1
    recipeStrength: float = 0.0
    potCapacity: int
    fillers: List[MealFillerItem] = Field(default_factory=list)
    fillerStrength: float = 0.0
    critMultiplier: float = 1.0
    finalStrength: float = 0.0


class WeeklyMealPlanResponse(BaseModel):
    totalStrength: float
    recipeStrengthTotal: float
    fillerStrengthTotal: float
    schedule: List[ScheduledMeal]
    recipeCounts: Dict[str, int]
    ingredientUsage: Dict[str, int]
    finalInventory: Dict[str, float]
    solveTimeMs: float
    status: str


def compute_recipe_strength(
    recipe: Dict[str, Any], level: int, raw_data: Dict[str, Any]
) -> float:
    """Compute recipe base energy at a given level (before map and crit)."""
    lvl_str = str(min(70, max(1, level)))
    bonus_table = raw_data.get("recipeLevelBonus", {})
    lvl_multiplier = float(bonus_table.get(lvl_str, 1.0))

    req_val = 0.0
    for ing_req in recipe.get("ingredients", []):
        ing_obj = DATA_LOADER.get_ingredient(ing_req["ingredient"])
        val = ing_obj["value"] if ing_obj else 0
        req_val += ing_req["amount"] * val

    recipe_bonus = recipe.get("bonus", 0.0)
    # round(req_val * lvl_multiplier * (1 + bonus / 100))
    return round(req_val * lvl_multiplier * (1.0 + recipe_bonus / 100.0))


def solve_weekly_meal_schedule(request: WeeklyMealRequest) -> WeeklyMealPlanResponse:
    t0 = time.time()
    raw = DATA_LOADER.raw_data
    all_recipes = raw.get("recipes", [])
    all_ingredients = raw.get("ingredients", [])

    # Filter candidate recipes by category
    target_category = request.mealCategory.lower()
    candidate_recipes: List[Dict[str, Any]] = []
    for r in all_recipes:
        if target_category in ["all", "any"] or r.get("type", "").lower() == target_category:
            candidate_recipes.append(r)

    # Calculate pot capacities per meal (21 meals)
    gct_mult = 1.5 if request.hasGoodCampTicket else 1.0
    weekday_pot = math.floor(request.basePotCapacity * gct_mult)
    sunday_pot = 2 * weekday_pot

    pots: List[int] = []
    crit_multipliers: List[float] = []
    map_mult = 1.0 + (request.islandBonus / 100.0)

    for m in range(21):
        is_sunday = m >= 18
        pots.append(sunday_pot if is_sunday else weekday_pot)
        crit_multipliers.append(
            request.sundayCritMultiplier if is_sunday else request.weekdayCritMultiplier
        )

    # Filter out recipes that exceed Sunday pot capacity
    valid_recipes: List[Dict[str, Any]] = [
        r for r in candidate_recipes if r.get("nrOfIngredients", 0) <= sunday_pot
    ]

    N = len(valid_recipes)
    K = len(all_ingredients)
    M = 21

    ing_index_map = {ing["name"]: idx for idx, ing in enumerate(all_ingredients)}
    ing_values = np.array([ing["value"] for ing in all_ingredients], dtype=float)

    # Compute recipe values and requirement vectors
    recipe_strengths = np.zeros(N)
    recipe_req_matrix = np.zeros((N, K))  # req[r, k]
    recipe_sizes = np.zeros(N)

    for r_idx, r in enumerate(valid_recipes):
        lvl = request.recipeLevels.get(r["name"], 1)
        recipe_strengths[r_idx] = compute_recipe_strength(r, lvl, raw)
        size = 0
        for ing_item in r.get("ingredients", []):
            ing_name = ing_item["ingredient"]
            amt = ing_item["amount"]
            size += amt
            if ing_name in ing_index_map:
                recipe_req_matrix[r_idx, ing_index_map[ing_name]] = amt
        recipe_sizes[r_idx] = size

    # Variables per meal m:
    # x_{m, r} for r in 0..N-1 (Binary)
    # f_{m, k} for k in 0..K-1 (Integer fillers, or 0 if fillPotWithLeftovers is False)
    stride = N + K
    n_vars = M * stride

    # Objective: c^T x (we minimize c, so c = -weights)
    c = np.zeros(n_vars)
    for m in range(M):
        eff_mult = crit_multipliers[m] * map_mult
        # Recipe weights
        for r in range(N):
            c[m * stride + r] = -eff_mult * recipe_strengths[r]
        # Filler weights
        for k in range(K):
            c[m * stride + N + k] = -eff_mult * ing_values[k]

    # Variable bounds and integrality
    lb = np.zeros(n_vars)
    ub = np.zeros(n_vars)
    integrality = np.ones(n_vars)

    for m in range(M):
        for r in range(N):
            idx = m * stride + r
            # Recipe can fit in pot for meal m?
            if recipe_sizes[r] <= pots[m]:
                ub[idx] = 1.0
            else:
                ub[idx] = 0.0

        for k in range(K):
            idx = m * stride + N + k
            ub[idx] = pots[m] if request.fillPotWithLeftovers else 0.0

    # Build Constraints:
    # 1. At most 1 recipe per meal: sum_r x_{m, r} <= 1  (M constraints)
    # 2. Pot capacity per meal: sum_r x_{m, r} * size[r] + sum_k f_{m, k} <= pots[m] (M constraints)
    # 3. Cumulative ingredient inventory: for each m, each k:
    #    sum_{j=0..m} (sum_r x_{j,r} * req[r,k] + f_{j,k}) <= Available(m, k) (M * K constraints)

    n_cons = M + M + M * K
    A = np.zeros((n_cons, n_vars))
    b_u = np.zeros(n_cons)

    row = 0

    # 1. At most 1 recipe per meal
    for m in range(M):
        for r in range(N):
            A[row, m * stride + r] = 1.0
        b_u[row] = 1.0
        row += 1

    # 2. Pot capacity
    for m in range(M):
        for r in range(N):
            A[row, m * stride + r] = recipe_sizes[r]
        for k in range(K):
            A[row, m * stride + N + k] = 1.0
        b_u[row] = float(pots[m])
        row += 1

    # 3. Cumulative ingredient flow conservation
    # Normalized inventory lookup
    current_inv = {k.lower(): v for k, v in request.currentInventory.items()}
    daily_prod = {k.lower(): v for k, v in request.dailyProduction.items()}

    for m in range(M):
        day_idx = m // 3  # 0..6
        meal_idx = m % 3  # 0..2
        # Fraction of day passed when cooking meal
        time_fraction = day_idx + (meal_idx + 1.0) / 3.0

        for k in range(K):
            ing_name = all_ingredients[k]["name"]
            init_val = float(current_inv.get(ing_name.lower(), 0))
            prod_val = float(daily_prod.get(ing_name.lower(), 0.0))
            available = init_val + time_fraction * prod_val

            for j in range(m + 1):
                for r in range(N):
                    req_amt = recipe_req_matrix[r, k]
                    if req_amt > 0:
                        A[row, j * stride + r] = req_amt
                A[row, j * stride + N + k] = 1.0

            b_u[row] = available
            row += 1

    A_sparse = csc_matrix(A)
    constraints = LinearConstraint(A_sparse, -np.inf, b_u)

    # Solve MILP
    sol = milp(c=c, constraints=constraints, integrality=integrality, bounds=(lb, ub))

    schedule: List[ScheduledMeal] = []
    recipe_counts: Dict[str, int] = {}
    ingredient_usage: Dict[str, int] = {}
    total_recipe_strength = 0.0
    total_filler_strength = 0.0
    total_strength = 0.0

    if sol.success:
        x_sol = np.round(sol.x)

        for m in range(M):
            day_idx = m // 3
            meal_in_day = m % 3
            day_name = DAYS[day_idx]
            meal_name = MEAL_NAMES[meal_in_day]
            crit_m = crit_multipliers[m]

            chosen_recipe: Optional[Dict[str, Any]] = None
            for r in range(N):
                if x_sol[m * stride + r] > 0.5:
                    chosen_recipe = valid_recipes[r]
                    break

            meal_recipe_strength = 0.0
            r_name = None
            r_disp = None
            r_lvl = 1

            if chosen_recipe:
                r_name = chosen_recipe["name"]
                r_disp = chosen_recipe.get("translations", {}).get("zh-CN", chosen_recipe.get("displayName", r_name))
                r_lvl = request.recipeLevels.get(r_name, 1)
                base_st = compute_recipe_strength(chosen_recipe, r_lvl, raw)
                meal_recipe_strength = base_st * crit_m * map_mult
                total_recipe_strength += meal_recipe_strength
                recipe_counts[r_disp] = recipe_counts.get(r_disp, 0) + 1

                for ing_req in chosen_recipe.get("ingredients", []):
                    i_name = ing_req["ingredient"]
                    amt = ing_req["amount"]
                    ingredient_usage[i_name] = ingredient_usage.get(i_name, 0) + amt

            fillers_list: List[MealFillerItem] = []
            meal_filler_strength = 0.0

            for k in range(K):
                f_amt = int(x_sol[m * stride + N + k])
                if f_amt > 0:
                    i_obj = all_ingredients[k]
                    i_name = i_obj["name"]
                    i_disp = i_obj.get("translations", {}).get("zh-CN", i_name)
                    i_val = i_obj["value"]
                    fillers_list.append(
                        MealFillerItem(
                            ingredient=i_name,
                            displayName=i_disp,
                            amount=f_amt,
                            value=i_val,
                        )
                    )
                    meal_filler_strength += f_amt * i_val * crit_m * map_mult
                    ingredient_usage[i_name] = ingredient_usage.get(i_name, 0) + f_amt

            total_filler_strength += meal_filler_strength
            meal_total = meal_recipe_strength + meal_filler_strength
            total_strength += meal_total

            schedule.append(
                ScheduledMeal(
                    mealIndex=m + 1,
                    day=day_name,
                    dayIndex=day_idx + 1,
                    mealName=meal_name,
                    recipeName=r_name,
                    displayName=r_disp,
                    recipeLevel=r_lvl,
                    recipeStrength=round(meal_recipe_strength, 1),
                    potCapacity=pots[m],
                    fillers=fillers_list,
                    fillerStrength=round(meal_filler_strength, 1),
                    critMultiplier=crit_m,
                    finalStrength=round(meal_total, 1),
                )
            )

    # Compute final inventory at end of week (Day 7)
    final_inv: Dict[str, float] = {}
    for ing in all_ingredients:
        ing_name = ing["name"]
        init_val = float(current_inv.get(ing_name.lower(), 0))
        prod_val = float(daily_prod.get(ing_name.lower(), 0.0))
        total_in = init_val + 7.0 * prod_val
        used = float(ingredient_usage.get(ing_name, 0))
        final_inv[ing_name] = max(0.0, round(total_in - used, 1))

    solve_time = (time.time() - t0) * 1000.0

    return WeeklyMealPlanResponse(
        totalStrength=round(total_strength, 1),
        recipeStrengthTotal=round(total_recipe_strength, 1),
        fillerStrengthTotal=round(total_filler_strength, 1),
        schedule=schedule,
        recipeCounts=recipe_counts,
        ingredientUsage=ingredient_usage,
        finalInventory=final_inv,
        solveTimeMs=round(solve_time, 2),
        status="optimal" if sol.success else sol.message,
    )

