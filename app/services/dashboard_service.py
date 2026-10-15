"""화면 단위 응답의 오케스트레이션 — 대시보드 메인(build)·첫 화면 묶음(bootstrap)·월간 회고(build_retrospective)·연간 리포트(yearly_report).

라우터에 흩어져 있던 기준 월 해석, ~15개 서비스 호출 조합, target_monthly/streak 계산을
서비스 계층으로 모아 재사용·테스트가 가능하게 했다. 순수 조합 로직이며 DB 쓰기는 없다(예외: bootstrap이 사진 버전을 처음 한 번 기록 —
couple_photo_service.get_photo_url).
"""
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.services import (
    coaching_engine,
    coaching_settings_service,
    goal_progress_service,
    goal_service,
    net_worth_service,
    savings_coaching_service,
    savings_product_service,
    settings_service,
    spending_review_service,
    transaction_report_service,
    transaction_trend_service,
    user_service,
)
from app.utils.dates import month_bounds, parse_year_month, shift_month, today_kst, year_bounds, year_month_str


def build(db: Session, *, year_month: str | None = None, today: date | None = None) -> dict:
    """year_month(기본: 이번 달) 한 달 기준 대시보드. 홈이 월 단위만 보여 주므로(오늘/이번 주 탭은 #77에서 제거)
    기간은 월 하나뿐이다."""
    today = today or today_kst()
    anchor = parse_year_month(year_month) if year_month else today
    start, end = month_bounds(anchor)

    snapshot = transaction_report_service.period_snapshot(db, start, end)
    totals, owner_totals, expense_breakdown = snapshot["totals"], snapshot["owner_totals"], snapshot["breakdown"]
    current_ym = year_month_str(start)
    goals = goal_service.list_goals(db)
    actual_saved = net_worth_service.savings_delta(db, current_ym)
    owner_overspend_highlights = transaction_report_service.owner_spending_detail(
        db, start, end, owner_totals, start
    )
    trend = transaction_trend_service.monthly_trend(db, months=6, anchor=end)
    fund_context = savings_coaching_service.emergency_fund_context(db, start)
    thresholds = coaching_settings_service.get_thresholds(db)
    benchmark_pcts = coaching_engine.benchmark_pcts_from_thresholds(thresholds)
    # 가이드라인 비교는 홈에서 코칭 인사이트(category_benchmark)로만 보여주고, 막대는 계획 › 실적 분석이 담당한다.
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
    investable_surplus = savings_coaching_service.investable_surplus(totals, actual_saved)
    surplus_allocation = savings_coaching_service.compute_surplus_allocation(
        db, month_start=start, surplus=investable_surplus, fund_context=fund_context
    )

    streak = savings_coaching_service.savings_streak_months(savings_coaching_service.savings_pace_history(db, trend, goals))

    return {
        "start": start,
        "end": end,
        "totals": totals,
        "owner_totals": owner_totals,
        "expense_breakdown": expense_breakdown,
        "owner_overspend_highlights": owner_overspend_highlights,
        "trend": trend,
        "insights": insights,
        "current_ym": current_ym,
        "savings_streak_months": streak,
        "investable_surplus": investable_surplus,
        "surplus_allocation": surplus_allocation,
    }


def retrospective_period(today: date) -> tuple[date, date, str]:
    """회고 대상 = 지난달(가장 최근 완결된 달)의 (시작일, 말일, "YYYY-MM"). 월간 메일은 집계 전에
    이 키로 켜짐·중복 여부부터 확인한다."""
    start, end = month_bounds(shift_month(today, -1))
    return start, end, year_month_str(start)


def build_retrospective(db: Session, today: date) -> dict:
    """지난달 회고 데이터의 단일 소스. 대시보드의 월간 회고 카드(GET /dashboard/retrospective)와
    월간 요약 이메일(notification_service.send_monthly_summary)이 같은 기간·집계를 쓴다 — 이메일은
    이 결과에 저축 스트릭·부부 기여도 문구를 얹고 HTML로 렌더한다."""
    start, end, year_month = retrospective_period(today)
    snapshot = transaction_report_service.period_snapshot(db, start, end)
    breakdown = snapshot["breakdown"]
    insights = coaching_engine.compute_insights(db, year_month, totals=snapshot["totals"], breakdown=breakdown)
    return {
        "year_month": year_month,
        "start": start,
        "end": end,
        **snapshot,
        "top_categories": breakdown[:3],
        "insights": insights,
    }


def bootstrap(db: Session, today: date, user_id: uuid.UUID) -> dict:
    """대시보드 첫 화면에 필요한 settings/net-worth/financial-goals/savings-products/users를 한 번에 — 모바일 등
    고지연 환경에서 마운트 시 병렬 요청 수를 줄이기 위함. 각 리소스의 개별 엔드포인트(GET /settings 등)는
    대시보드 밖 화면들이 계속 쓰므로 그대로 둔다(응답 모양도 그 엔드포인트들과 같다)."""
    return {
        "settings": settings_service.build_settings_out(db, user_id),
        "net_worth": net_worth_service.overview(db, 12),
        "goals": goal_progress_service.list_out(db, goal_service.list_goals(db), today),
        "savings_products": savings_product_service.list_products(db),
        "users": user_service.list_users(db),
    }


def yearly_report(db: Session, year: int, owner_filter) -> dict:
    """연간 리포트(YearlyReportOut). owner_filter는 category_breakdown_by_owner()가 받는 값
    (None=가구 전체, "shared"=공통 지출, UUID=배우자)."""
    monthly = transaction_trend_service.yearly_monthly_breakdown(db, year)
    # totals(소득 등)는 owner 필터와 무관하게 항상 가구 전체 기준으로 유지한다 — benchmark 비교가
    # "가구 소득 대비 이 배우자의 지출 비중"을 뜻하도록 하기 위함("이 배우자 개인 소득 대비"가 아님).
    totals = transaction_trend_service.yearly_totals(db, year)
    start, end = year_bounds(year)
    breakdown = transaction_report_service.category_breakdown_by_owner(db, start, end, "expense", owner_filter)
    benchmark_pcts = coaching_engine.benchmark_pcts_from_thresholds(coaching_settings_service.get_thresholds(db))
    return {
        "year": year,
        "prev_year": year - 1,
        "next_year": year + 1,
        "monthly": monthly,
        "totals": totals,
        "breakdown": breakdown,
        "benchmark": coaching_engine.category_benchmark_rows(totals, breakdown, benchmark_pcts),
    }


def build_savings_review(db: Session, year_month: str | None, owner_filter, today: date) -> dict:
    """절감 점검 화면(SavingsReviewOut). 기준월 기본값은 지난달 — spending_review_service.default_year_month.
    owner_filter는 yearly_report와 같은 값(None=가구 전체, "shared"=공통, UUID=배우자)."""
    year_month = year_month or spending_review_service.default_year_month(today)
    spending = spending_review_service.build_spending_review(db, year_month, owner=owner_filter, today=today)
    return {
        "year_month": year_month,
        "spending": spending,
        "total_estimated_monthly_saving": spending["total_estimated_monthly_saving"],
    }
