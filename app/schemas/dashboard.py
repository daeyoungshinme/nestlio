from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.coaching import InsightOut
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
