from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOut, MonthlyRetrospectiveOut
from app.services import (
    coaching_engine,
    coaching_settings_service,
    goal_service,
    net_worth_service,
    retrospective_service,
    transaction_report_service,
)
from app.utils.dates import month_bounds, parse_year_month, week_bounds, year_month_str

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

    totals = transaction_report_service.period_totals(db, start, end)
    owner_totals = transaction_report_service.totals_by_owner(db, start, end)
    expense_breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    current_ym = year_month_str(start)
    goals = goal_service.list_goals(db)
    actual_saved = net_worth_service.savings_delta(db, current_ym)
    month_start = month_bounds(anchor)[0]
    owner_overspend_highlights = transaction_report_service.owner_spending_detail(
        db, start, end, owner_totals, month_start
    )
    trend = transaction_report_service.monthly_trend(db, months=6, anchor=end)
    fund_context = coaching_engine.emergency_fund_context(db, month_start)
    thresholds = coaching_settings_service.get_thresholds(db)
    benchmark_pcts = coaching_engine.benchmark_pcts_from_thresholds(thresholds)
    category_benchmarks = coaching_engine.category_benchmark_rows(totals, expense_breakdown, benchmark_pcts)
    insights = coaching_engine.compute_insights(
        db,
        current_ym,
        totals=totals,
        breakdown=expense_breakdown,
        goals=goals,
        actual_saved=actual_saved,
        fund_context=fund_context,
        thresholds=thresholds,
        benchmark_rows=category_benchmarks,
    )
    investable_surplus = coaching_engine.investable_surplus(totals, actual_saved)
    surplus_allocation = coaching_engine.compute_surplus_allocation(
        db, month_start=month_start, surplus=investable_surplus, fund_context=fund_context
    )

    target_monthly = sum((g.monthly_saving_amount for g in goals), Decimal("0"))
    streak = coaching_engine.savings_streak_months(trend, target_monthly)

    return {
        "period": period,
        "start": start,
        "end": end,
        "totals": totals,
        "owner_totals": owner_totals,
        "expense_breakdown": expense_breakdown,
        "owner_overspend_highlights": owner_overspend_highlights,
        "category_benchmarks": category_benchmarks,
        "trend": trend,
        "insights": insights,
        "current_ym": current_ym,
        "savings_streak_months": streak,
        "investable_surplus": investable_surplus,
        "surplus_allocation": surplus_allocation,
    }


@router.get("/monthly-retrospective", response_model=MonthlyRetrospectiveOut)
def monthly_retrospective(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """지난달(가장 최근 완결된 달) 요약 — 부부가 함께 돌아보는 월간 회고 카드용.
    월간 요약 이메일(notification_service.send_monthly_summary)과 retrospective_service를 공유한다."""
    r = retrospective_service.build(db, date.today())
    return {
        "year_month": r["year_month"],
        "start": r["start"],
        "end": r["end"],
        "totals": r["totals"],
        "owner_totals": r["owner_totals"],
        "top_categories": r["top_categories"],
        "insights": r["insights"],
    }
