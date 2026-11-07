"""FastAPI router for optimization endpoints."""

from fastapi import APIRouter
from optimizer.weekly_meals import (
    WeeklyMealPlanResponse,
    WeeklyMealRequest,
    solve_weekly_meal_schedule,
)

router = APIRouter(prefix="/api/optimize", tags=["optimizer"])


@router.post("/weekly-meals", response_model=WeeklyMealPlanResponse)
async def api_weekly_meals(request: WeeklyMealRequest):
    """
    R2 Weekly Meal Planning:
    Solves 21-meal linear programming schedule to maximize weekly dish power
    under ingredient cumulative inflow and pot capacity constraints.
    """
    return solve_weekly_meal_schedule(request)

