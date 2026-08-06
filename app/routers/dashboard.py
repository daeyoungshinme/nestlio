from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOut, MonthlyRetrospectiveOut
from app.services import challenge_service, coaching_engine, goal_service, transaction_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, week_bounds, year_month_str

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    period: Literal["today", "week", "month"] = "month",
    day: str | None = Query(None, alias="date"),
    year_month: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    if period == "today":
        anchor = date.fromisoformat(day) if day else today
        start, end = anchor, anchor
    elif period == "week":
        anchor = date.fromisoformat(day) if day else today
        start, end = week_bounds(anchor)
    else:
        anchor = parse_year_month(year_month) if year_month else today
        start, end = month_bounds(anchor)

    totals = transaction_service.period_totals(db, start, end)
    by_user = transaction_service.totals_by_user(db, start, end)
    expense_breakdown = transaction_service.category_breakdown(db, start, end, "expense")
    trend = transaction_service.monthly_trend(db, months=6, anchor=end)
    current_ym = year_month_str(start)
    goals = goal_service.list_goals(db)
    insights = coaching_engine.compute_insights(
        db, current_ym, totals=totals, breakdown=expense_breakdown, goals=goals
    )

    target_monthly = sum((g.monthly_saving_amount for g in goals), Decimal("0"))
    streak = coaching_engine.savings_streak_months(trend, target_monthly)

    challenges = challenge_service.list_challenges(db)
    status_asof = min(end, today)
    active_challenge = next(
        (c for c in challenges if challenge_service.effective_status(c, status_asof) == "active"), None
    )

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
        "savings_streak_months": streak,
        "active_challenge": challenge_service.to_out(active_challenge, status_asof) if active_challenge else None,
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
    breakdown = transaction_service.category_breakdown(db, start, end, "expense")
    insights = coaching_engine.compute_insights(db, year_month, totals=totals, breakdown=breakdown)

    return {
        "year_month": year_month,
        "start": start,
        "end": end,
        "totals": totals,
        "by_user": by_user,
        "top_categories": breakdown[:3],
        "insights": insights,
    }
