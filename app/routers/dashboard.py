from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOut, MonthlyRetrospectiveOut
from app.services import coaching_engine, transaction_service
from app.utils.dates import month_bounds, shift_month, week_bounds, year_month_str

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


@router.get("/monthly-retrospective", response_model=MonthlyRetrospectiveOut)
def monthly_retrospective(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """지난달(가장 최근 완결된 달) 요약 — 부부가 함께 돌아보는 월간 회고 카드용.
    이메일 전용이던 notification_service.send_monthly_summary와 같은 기간·데이터 소스를 재사용한다."""
    prev_month_anchor = shift_month(date.today(), -1)
    start, end = month_bounds(prev_month_anchor)
    year_month = year_month_str(start)

    totals = transaction_service.period_totals(db, start, end)
    by_user = transaction_service.totals_by_user(db, start, end)
    top_categories = transaction_service.category_breakdown(db, start, end, "expense")[:3]
    insights = coaching_engine.compute_insights(db, year_month)

    return {
        "year_month": year_month,
        "start": start,
        "end": end,
        "totals": totals,
        "by_user": by_user,
        "top_categories": top_categories,
        "insights": insights,
    }
