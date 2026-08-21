import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.coaching import InsightOut, SurplusAllocationOut
from app.schemas.common import CategoryAmountOut, CategoryBenchmarkRowOut, OwnerTotalsOut, TotalsOut, TrendRowOut


class OwnerOverspendHighlightOut(BaseModel):
    owner_user_id: uuid.UUID | None
    display_name: str
    category_name: str
    amount: Decimal
    avg_amount: Decimal
    delta: Decimal


class DashboardOut(BaseModel):
    period: Literal["today", "week", "month"]
    start: date
    end: date
    totals: TotalsOut
    owner_totals: list[OwnerTotalsOut]
    expense_breakdown: list[CategoryAmountOut]
    owner_overspend_highlights: list[OwnerOverspendHighlightOut]
    category_benchmarks: list[CategoryBenchmarkRowOut]
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
    owner_totals: list[OwnerTotalsOut]
    top_categories: list[CategoryAmountOut]
    insights: list[InsightOut]
