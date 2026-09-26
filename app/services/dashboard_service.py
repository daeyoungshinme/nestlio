"""대시보드 메인 응답(app/routers/dashboard.py::dashboard)의 오케스트레이션.

라우터에 흩어져 있던 기준 월 해석, ~15개 서비스 호출 조합, target_monthly/streak 계산을
서비스 계층으로 모아 재사용·테스트가 가능하게 했다. 순수 조합 로직이며 DB 쓰기는 없다.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.services import (
    coaching_engine,
    coaching_settings_service,
    goal_service,
    net_worth_service,
    transaction_report_service,
)
from app.utils.dates import month_bounds, parse_year_month, today_kst, year_month_str


def build(db: Session, *, year_month: str | None = None, today: date | None = None) -> dict:
    """year_month(기본: 이번 달) 한 달 기준 대시보드. 홈이 월 단위만 보여 주므로(오늘/이번 주 탭은 #77에서 제거)
    기간은 월 하나뿐이다."""
    today = today or today_kst()
    anchor = parse_year_month(year_month) if year_month else today
    start, end = month_bounds(anchor)

    totals = transaction_report_service.period_totals(db, start, end)
    owner_totals = transaction_report_service.totals_by_owner(db, start, end)
    expense_breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    current_ym = year_month_str(start)
    goals = goal_service.list_goals(db)
    actual_saved = net_worth_service.savings_delta(db, current_ym)
    owner_overspend_highlights = transaction_report_service.owner_spending_detail(
        db, start, end, owner_totals, start
    )
    trend = transaction_report_service.monthly_trend(db, months=6, anchor=end)
    fund_context = coaching_engine.emergency_fund_context(db, start)
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
        db, month_start=start, surplus=investable_surplus, fund_context=fund_context
    )

    streak = coaching_engine.savings_streak_months(coaching_engine.savings_pace_history(db, trend, goals))

    return {
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
