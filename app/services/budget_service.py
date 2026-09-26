from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.annual_plan_item import AnnualPlanItem
from app.models.annual_plan_item_monthly_target import AnnualPlanItemMonthlyTarget
from app.models.category import Category
from app.services import plan_targets
from app.services.transaction_report_service import category_breakdown, trailing_average_by_category
from app.utils.dates import month_bounds, parse_year_month
from app.utils.plan_status import pct_of


def get_budgets_for_month(db: Session, year_month: str) -> dict[int, Decimal]:
    """카테고리를 태깅한 계획 항목의 그 달 금액을 카테고리별로 합산한다(계획 원본은 AnnualPlanItem의
    월별 target 하나뿐 — 이번 달 계획 화면·예산 경고·코칭이 모두 같은 값을 본다). 한 카테고리에 여러 항목이
    태깅될 수 있으므로(예: 서로 다른 이름의 두 구독이 같은 "구독" 카테고리) 예산 상한은 항상 합계다.
    반복거래 연동 항목은 plan_targets.EFFECTIVE_* 식으로 연동된 RecurringExpense의 현재 금액/카테고리를 쓴다."""
    query = db.query(plan_targets.EFFECTIVE_CATEGORY_ID, func.sum(plan_targets.EFFECTIVE_TARGET_AMOUNT)).select_from(
        AnnualPlanItemMonthlyTarget
    ).join(AnnualPlanItem, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
    rows = (
        plan_targets.join_recurring(query)
        .filter(
            AnnualPlanItemMonthlyTarget.year_month == year_month,
            plan_targets.EFFECTIVE_CATEGORY_ID.isnot(None),
        )
        .group_by(plan_targets.EFFECTIVE_CATEGORY_ID)
        .all()
    )
    return dict(rows)


def build_category_rows(
    db: Session,
    actuals: dict[int, Decimal],
    budgets: dict[int, Decimal],
    warn_pct: float | None = None,
    critical_pct: float | None = None,
    *,
    suggested: dict[int, Decimal] | None = None,
) -> list[dict]:
    """활성 지출 카테고리별로 예산(미설정 시 0) 대비 실적 행을 만든다. 월간(budget_vs_actual)과
    연간(annual_plan_service.category_budget_vs_actual)이 이 골격을 공유한다 — actuals/budgets 맵만
    각자 만들어 넘긴다. suggested를 넘기면 각 행에 `suggested_amount`를 채운다(연 단위에선 생략).
    status 임계값은 warn_pct/critical_pct(가구 조정값)로 통일한다 — 안 넘기면 env 기본값."""
    categories = (
        db.query(Category)
        .filter(Category.is_active.is_(True), Category.kind == "expense")
        .order_by(Category.type, Category.sort_order, Category.name)
        .all()
    )
    rows = []
    for cat in categories:
        budget_amount = budgets.get(cat.id, Decimal("0"))
        actual = actuals.get(cat.id, Decimal("0"))
        pct = pct_of(actual, budget_amount)
        row = {
            "category_id": cat.id,
            "name": cat.name,
            "type": cat.type,
            "color": cat.color,
            "budget": budget_amount,
            "actual": actual,
            "pct": pct,
            "status": plan_targets.budget_status(cat.type, pct, warn_pct, critical_pct) if budget_amount else ("warn" if actual else "ok"),
        }
        if suggested is not None:
            row["suggested_amount"] = suggested.get(cat.id)
        rows.append(row)
    return rows


def budget_vs_actual(
    db: Session,
    year_month: str,
    warn_pct: float | None = None,
    critical_pct: float | None = None,
    *,
    suggested: dict[int, Decimal] | None = None,
    with_suggested: bool = True,
) -> list[dict]:
    """For every active category, compare this month's actual expense against its budget (0 if unset).
    warn_pct/critical_pct default to the env-configured thresholds but callers (e.g. coaching_engine)
    may pass household-overridden values from coaching_settings_service.

    `suggested_amount`(직전 3개월 카테고리 평균)는 3개월치 집계 쿼리가 필요하다 — 호출부가 이미
    계산해뒀으면 `suggested`로 넘겨 재계산을 피하고, 필요 없으면 `with_suggested=False`로 건너뛴다
    (예: 거래 저장마다 도는 예산 경고 알림)."""
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)
    actuals = {row["category_id"]: row["amount"] for row in category_breakdown(db, start, end, "expense")}
    budgets = get_budgets_for_month(db, year_month)
    if suggested is None and with_suggested:
        suggested = trailing_average_by_category(db, month_start, months=3, type_="expense")
    return build_category_rows(db, actuals, budgets, warn_pct, critical_pct, suggested=suggested)
