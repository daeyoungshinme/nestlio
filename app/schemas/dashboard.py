from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.coaching import InsightOut, SurplusAllocationOut
from app.schemas.common import CategoryAmountOut, TotalsOut, TrendRowOut, UserTotalsOut


class DashboardOut(BaseModel):
    period: Literal["today", "week", "month"]
    start: date
    end: date
    totals: TotalsOut
    by_user: list[UserTotalsOut]
    expense_breakdown: list[CategoryAmountOut]
    trend: list[TrendRowOut]
    insights: list[InsightOut]
    current_ym: str
    savings_streak_months: int
    investable_surplus: Decimal
    surplus_allocation: SurplusAllocationOut


class MonthlyRetrospectiveOut(BaseModel):
    year_month: str
    start: date
    end: date
    totals: TotalsOut
    by_user: list[UserTotalsOut]
    top_categories: list[CategoryAmountOut]
    insights: list[InsightOut]
