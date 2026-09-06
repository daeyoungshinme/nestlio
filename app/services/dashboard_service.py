"""대시보드 메인 응답(app/routers/dashboard.py::dashboard)의 오케스트레이션.

라우터에 흩어져 있던 기간/기준일 분기, ~15개 서비스 호출 조합, target_monthly/streak 계산을
서비스 계층으로 모아 재사용·테스트가 가능하게 했다. 순수 조합 로직이며 DB 쓰기는 없다.
"""
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.services import (
    coaching_engine,
    coaching_settings_service,
    goal_service,
    net_worth_service,
    transaction_report_service,
)
from app.utils.dates import month_bounds, parse_year_month, week_bounds, year_month_str

Period = Literal["today", "week", "month"]


def _resolve_range(period: Period, day: str | None, year_month: str | None, today: date):
    if period == "today":
        anchor = date.fromisoformat(day) if day else today
        return anchor, anchor, anchor
    if period == "week":
        anchor = date.fromisoformat(day) if day else today
        start, end = week_bounds(anchor)
        return anchor, start, end
    anchor = parse_year_month(year_month) if year_month else today
    start, end = month_bounds(anchor)
    return anchor, start, end


def build(
    db: Session,
    *,
    period: Period = "month",
    day: str | None = None,
    year_month: str | None = None,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    anchor, start, end = _resolve_range(period, day, year_month, today)

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
