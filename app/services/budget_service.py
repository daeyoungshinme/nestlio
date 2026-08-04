from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import Category
from app.models.cashflow_plan_item import CashflowPlanItem
from app.services.transaction_service import category_breakdown
from app.utils.dates import month_bounds, parse_year_month


def get_budgets_for_month(db: Session, year_month: str) -> dict[int, Decimal]:
    """카테고리를 태깅한 계획 항목(cashflow_plan_service가 다루는 것과 같은 행)들을 카테고리별로 합산한다.
    한 카테고리에 여러 항목이 태깅될 수 있으므로(예: 서로 다른 이름의 두 구독이 같은 "구독" 카테고리) 예산 상한은
    항상 합계다. 항목 입력/수정은 cashflow_plan_service.upsert_item(category_id=...)이 전담한다 — 이 서비스는
    실적 대비 집계(budget_vs_actual)만 다룬다."""
    rows = (
        db.query(CashflowPlanItem.category_id, func.sum(CashflowPlanItem.amount))
        .filter(CashflowPlanItem.year_month == year_month, CashflowPlanItem.category_id.isnot(None))
        .group_by(CashflowPlanItem.category_id)
        .all()
    )
    return {category_id: total for category_id, total in rows}


def _status(pct: float, warn_pct: float | None = None, critical_pct: float | None = None) -> str:
    warn_pct = settings.budget_warn_pct if warn_pct is None else warn_pct
    critical_pct = settings.budget_critical_pct if critical_pct is None else critical_pct
    if pct >= critical_pct:
        return "critical"
    if pct >= warn_pct:
        return "warn"
    return "ok"


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
        pct = float(actual / budget_amount * 100) if budget_amount else (100.0 if actual else 0.0)
        result.append(
            {
                "category_id": cat.id,
                "name": cat.name,
                "type": cat.type,
                "color": cat.color,
                "budget": budget_amount,
                "actual": actual,
                "pct": min(pct, 999),
                "status": _status(pct, warn_pct, critical_pct) if budget_amount else ("warn" if actual else "ok"),
            }
        )
    return result
