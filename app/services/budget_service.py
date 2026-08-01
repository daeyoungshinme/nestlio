import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.budget import Budget
from app.models.category import Category
from app.services.transaction_service import category_breakdown
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str


def get_budgets_for_month(db: Session, year_month: str) -> dict[int, Budget]:
    rows = db.query(Budget).filter(Budget.year_month == year_month).all()
    return {b.category_id: b for b in rows}


def upsert_budget(db: Session, category_id: int, year_month: str, amount: Decimal, updated_by: uuid.UUID) -> Budget:
    budget = (
        db.query(Budget)
        .filter(Budget.category_id == category_id, Budget.year_month == year_month)
        .first()
    )
    if budget is None:
        budget = Budget(category_id=category_id, year_month=year_month, amount=amount, updated_by=updated_by)
        db.add(budget)
    else:
        budget.amount = amount
        budget.updated_by = updated_by
    db.commit()
    db.refresh(budget)
    return budget


def copy_from_previous_month(db: Session, year_month: str, updated_by: uuid.UUID) -> int:
    """Copy previous month's budget amounts into `year_month` for categories that don't yet have one. Returns count copied."""
    this_month_start = parse_year_month(year_month)
    prev_month_str = year_month_str(shift_month(this_month_start, -1))
    prev_budgets = get_budgets_for_month(db, prev_month_str)
    existing = get_budgets_for_month(db, year_month)
    copied = 0
    for category_id, prev_budget in prev_budgets.items():
        if category_id in existing:
            continue
        db.add(
            Budget(
                category_id=category_id,
                year_month=year_month,
                amount=prev_budget.amount,
                updated_by=updated_by,
            )
        )
        copied += 1
    db.commit()
    return copied


def _status(pct: float) -> str:
    if pct >= settings.budget_critical_pct:
        return "critical"
    if pct >= settings.budget_warn_pct:
        return "warn"
    return "ok"


def budget_vs_actual(db: Session, year_month: str) -> list[dict]:
    """For every active category, compare this month's actual expense against its budget (0 if unset)."""
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
                "status": _status(pct) if budget_amount else ("warn" if actual else "ok"),
            }
        )
    return result
