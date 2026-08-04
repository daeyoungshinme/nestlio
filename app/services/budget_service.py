import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import Category
from app.models.cashflow_plan_item import CashflowPlanItem
from app.services.transaction_service import category_breakdown
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str


def get_budgets_for_month(db: Session, year_month: str) -> dict[int, CashflowPlanItem]:
    rows = (
        db.query(CashflowPlanItem)
        .filter(CashflowPlanItem.year_month == year_month, CashflowPlanItem.category_id.isnot(None))
        .all()
    )
    return {r.category_id: r for r in rows}


def upsert_budget(
    db: Session, category_id: int, year_month: str, amount: Decimal, updated_by: uuid.UUID
) -> CashflowPlanItem:
    item = (
        db.query(CashflowPlanItem)
        .filter(CashflowPlanItem.category_id == category_id, CashflowPlanItem.year_month == year_month)
        .first()
    )
    if item is None:
        category = db.get(Category, category_id)
        item = CashflowPlanItem(
            category_id=category_id,
            section=category.type if category else "variable",
            year_month=year_month,
            name=category.name if category else "",
            amount=amount,
            updated_by=updated_by,
        )
        db.add(item)
    else:
        item.amount = amount
        item.updated_by = updated_by
    db.commit()
    db.refresh(item)
    return item


def copy_from_previous_month(db: Session, year_month: str, updated_by: uuid.UUID) -> int:
    """Copy previous month's budget amounts into `year_month` for categories that don't yet have one. Returns count copied."""
    this_month_start = parse_year_month(year_month)
    prev_month_str = year_month_str(shift_month(this_month_start, -1))
    prev_budgets = get_budgets_for_month(db, prev_month_str)
    existing = get_budgets_for_month(db, year_month)
    copied = 0
    for category_id, prev_item in prev_budgets.items():
        if category_id in existing:
            continue
        db.add(
            CashflowPlanItem(
                category_id=category_id,
                section=prev_item.section,
                year_month=year_month,
                name=prev_item.name,
                amount=prev_item.amount,
                updated_by=updated_by,
            )
        )
        copied += 1
    db.commit()
    return copied


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
        budget = budgets.get(cat.id)
        budget_amount = budget.amount if budget else Decimal("0")
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
