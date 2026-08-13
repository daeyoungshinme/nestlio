from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import Category
from app.models.cashflow_plan_item import CashflowPlanItem
from app.models.recurring_expense import RecurringExpense
from app.services.transaction_report_service import category_breakdown
from app.utils.dates import month_bounds, parse_year_month
from app.utils.plan_status import pct_of, status_from_pct


def get_budgets_for_month(db: Session, year_month: str) -> dict[int, Decimal]:
    """카테고리를 태깅한 계획 항목(cashflow_plan_service가 다루는 것과 같은 행)들을 카테고리별로 합산한다.
    한 카테고리에 여러 항목이 태깅될 수 있으므로(예: 서로 다른 이름의 두 구독이 같은 "구독" 카테고리) 예산 상한은
    항상 합계다. 항목 입력/수정은 cashflow_plan_service.upsert_item(category_id=...)이 전담한다 — 이 서비스는
    실적 대비 집계(budget_vs_actual)만 다룬다.

    이 함수는 SQL 집계라서 CashflowPlanItem.amount/category_id 파이썬 프로퍼티(read-through)를 거치지 않으므로,
    반복거래에 연동된 항목은 own_amount/own_category_id 대신 연동된 RecurringExpense의 값을 직접 CASE로
    끌어와 합산한다 — 그렇지 않으면 반복거래 금액을 바꿔도 예산 상한이 갱신되지 않는 드리프트가 재발한다."""
    effective_category_id = case(
        (CashflowPlanItem.recurring_expense_id.isnot(None), RecurringExpense.category_id),
        else_=CashflowPlanItem.own_category_id,
    )
    effective_amount = case(
        (CashflowPlanItem.recurring_expense_id.isnot(None), RecurringExpense.amount),
        else_=CashflowPlanItem.own_amount,
    )
    rows = (
        db.query(effective_category_id, func.sum(effective_amount))
        .select_from(CashflowPlanItem)
        .outerjoin(RecurringExpense, CashflowPlanItem.recurring_expense_id == RecurringExpense.id)
        .filter(CashflowPlanItem.year_month == year_month, effective_category_id.isnot(None))
        .group_by(effective_category_id)
        .all()
    )
    return {category_id: total for category_id, total in rows}


def _status(pct: float, warn_pct: float | None = None, critical_pct: float | None = None) -> str:
    warn_pct = settings.budget_warn_pct if warn_pct is None else warn_pct
    critical_pct = settings.budget_critical_pct if critical_pct is None else critical_pct
    return status_from_pct(pct, warn_pct, critical_pct)


def budget_vs_actual(
    db: Session, year_month: str, warn_pct: float | None = None, critical_pct: float | None = None
) -> list[dict]:
    """For every active category, compare this month's actual expense against its budget (0 if unset).
    warn_pct/critical_pct default to the env-configured thresholds but callers (e.g. coaching_engine)
    may pass household-overridden values from coaching_settings_service."""
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)
    actuals = {row["category_id"]: row["amount"] for row in category_breakdown(db, start, end, "expense")}
    budgets = get_budgets_for_month(db, year_month)
    categories = (
        db.query(Category)
        .filter(Category.is_active.is_(True), Category.kind == "expense")
        .order_by(Category.type, Category.sort_order, Category.name)
        .all()
    )
    result = []
    for cat in categories:
        budget_amount = budgets.get(cat.id, Decimal("0"))
        actual = actuals.get(cat.id, Decimal("0"))
        pct = pct_of(actual, budget_amount)
        result.append(
            {
                "category_id": cat.id,
                "name": cat.name,
                "type": cat.type,
                "color": cat.color,
                "budget": budget_amount,
                "actual": actual,
                "pct": pct,
                "status": _status(pct, warn_pct, critical_pct) if budget_amount else ("warn" if actual else "ok"),
            }
        )
    return result
