import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.coaching import InsightOut, SurplusAllocationOut
from app.schemas.common import CategoryAmountOut, CategoryBenchmarkRowOut, OwnerTotalsOut, TotalsOut, TrendRowOut
from app.schemas.financial_goal import FinancialGoalOut
from app.schemas.net_worth import NetWorthOut
from app.schemas.savings_product import SavingsProductOut
from app.schemas.settings import SettingsOut
from app.schemas.user import UserOut


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


class DashboardBootstrapOut(BaseModel):
    """대시보드 첫 화면에 필요한, 느리게 변하는 참조 데이터를 한 번에 묶어 조회한다 — 요청 수를
    줄이기 위한 것으로 dashboard/cashflow-plan(기간별 캐시 키가 다름)과 events/notifications
    (폴링 주기가 다름)는 여기 포함하지 않는다."""

    settings: SettingsOut
    net_worth: NetWorthOut
    goals: list[FinancialGoalOut]
    savings_products: list[SavingsProductOut]
    users: list[UserOut]


class MonthlyRetrospectiveOut(BaseModel):
    year_month: str
    start: date
    end: date
    totals: TotalsOut
    owner_totals: list[OwnerTotalsOut]
    top_categories: list[CategoryAmountOut]
    insights: list[InsightOut]
