from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOut
from app.services import coaching_engine, transaction_service
from app.utils.dates import month_bounds, week_bounds, year_month_str

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    period: Literal["today", "week", "month"] = "month",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    if period == "today":
        start, end = today, today
    elif period == "week":
        start, end = week_bounds(today)
    else:
        start, end = month_bounds(today)

    totals = transaction_service.period_totals(db, start, end)
    by_user = transaction_service.totals_by_user(db, start, end)
    expense_breakdown = transaction_service.category_breakdown(db, start, end, "expense")
    trend = transaction_service.monthly_trend(db, months=6, anchor=today)
    current_ym = year_month_str(today)
    insights = coaching_engine.compute_insights(db, current_ym)

    return {
        "period": period,
        "start": start,
        "end": end,
        "totals": totals,
        "by_user": by_user,
        "expense_breakdown": expense_breakdown,
        "trend": trend,
        "insights": insights,
        "current_ym": current_ym,
    }
