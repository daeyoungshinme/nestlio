import uuid
from decimal import ROUND_DOWN, Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.cashflow_plan_item import CashflowPlanItem
from app.services import transaction_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str

EXPENSE_SECTIONS = ("fixed", "variable", "irregular")
ACHIEVEMENT_SECTIONS = ("income", "fixed", "variable", "irregular")


def list_items(db: Session, year_month: str) -> list[CashflowPlanItem]:
    """category_id가 채워진 행(카테고리별 예산 상한, budget_service가 다룸)은 제외한다 — 이 목록은
    자유 텍스트 계획 항목 전용이다."""
    return (
        db.query(CashflowPlanItem)
        .filter(CashflowPlanItem.year_month == year_month, CashflowPlanItem.category_id.is_(None))
        .order_by(CashflowPlanItem.section, CashflowPlanItem.sort_order)
        .all()
    )


def upsert_item(
    db: Session,
    id: int | None,
    section: str,
    owner_user_id: uuid.UUID | None,
    name: str,
    amount: Decimal,
    sort_order: int,
    year_month: str,
    updated_by: uuid.UUID,
) -> CashflowPlanItem:
    item = db.get(CashflowPlanItem, id) if id is not None else None
    if item is None:
        item = CashflowPlanItem(
            section=section,
            year_month=year_month,
            owner_user_id=owner_user_id,
            name=name,
            amount=amount,
            sort_order=sort_order,
            updated_by=updated_by,
        )
        db.add(item)
    else:
        item.section = section
        item.owner_user_id = owner_user_id
        item.name = name
        item.amount = amount
        item.sort_order = sort_order
        item.updated_by = updated_by
    db.commit()
    db.refresh(item)
    return item


def split_item_into_months(
    db: Session,
    section: str,
    owner_user_id: uuid.UUID | None,
    name: str,
    total_amount: Decimal,
    start_year_month: str,
    months: int,
    sort_order: int,
    updated_by: uuid.UUID,
) -> list[CashflowPlanItem]:
    """총액을 `months`개월로 나눠 `start_year_month`부터 매월 계획 항목을 생성한다 (할부처럼 분할).
    나눗셈 나머지는 앞쪽 달부터 1원 단위로 얹어 합계가 총액과 정확히 일치하도록 한다.
    생성된 각 행은 이후 서로 독립적으로 수정/삭제된다 (그룹 전체에 영향 없음)."""
    unit = Decimal("0.01")
    base = (total_amount / months).quantize(unit, rounding=ROUND_DOWN)
    remainder_units = int((total_amount - base * months) / unit)

    start = parse_year_month(start_year_month)
    created: list[CashflowPlanItem] = []
    for i in range(months):
        amount = base + (unit if i < remainder_units else Decimal("0"))
        item = CashflowPlanItem(
            section=section,
            year_month=year_month_str(shift_month(start, i)),
            owner_user_id=owner_user_id,
            name=name,
            amount=amount,
            sort_order=sort_order,
            installment_no=i + 1,
            installment_total=months,
            installment_total_amount=total_amount,
            updated_by=updated_by,
        )
        db.add(item)
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
    return created


def delete_item(db: Session, id: int) -> None:
    item = db.get(CashflowPlanItem, id)
    if item is not None:
        db.delete(item)
        db.commit()


def copy_from_previous_month(db: Session, year_month: str, updated_by: uuid.UUID) -> int:
    """Copy previous month's plan items into `year_month` for (section, name) combos missing there. Returns count copied."""
    this_month_start = parse_year_month(year_month)
    prev_month_str = year_month_str(shift_month(this_month_start, -1))
    prev_items = list_items(db, prev_month_str)
    existing_keys = {(item.section, item.name) for item in list_items(db, year_month)}
    copied = 0
    for item in prev_items:
        key = (item.section, item.name)
        if key in existing_keys:
            continue
        db.add(
            CashflowPlanItem(
                section=item.section,
                year_month=year_month,
                owner_user_id=item.owner_user_id,
                name=item.name,
                amount=item.amount,
                sort_order=item.sort_order,
                updated_by=updated_by,
            )
        )
        copied += 1
    db.commit()
    return copied


def actuals_for_month(db: Session, year_month: str) -> dict[str, Decimal]:
    """Actual income/fixed/variable totals for the month, for section-level achievement comparison."""
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)
    totals = transaction_service.period_totals(db, start, end)
    return {
        "income": totals["income"],
        "fixed": totals["fixed"],
        "variable": totals["variable"],
        "irregular": totals["irregular"],
    }


def _status(section: str, pct: float) -> str:
    """fixed/variable: 실적이 계획을 초과할수록 위험. income은 방향이 반대(실적이 계획에 못 미칠수록 위험)이므로
    미달분(100-pct)을 같은 임계값과 비교한다 (예: pct<=100-90=10일 때 warn, pct<=100-100=0일 때 critical)."""
    effective_pct = (100 - pct) if section == "income" else pct
    if effective_pct >= settings.budget_critical_pct:
        return "critical"
    if effective_pct >= settings.budget_warn_pct:
        return "warn"
    return "ok"


def _section_summary(section: str, planned: Decimal, actual: Decimal | None) -> dict:
    if actual is None:
        return {"planned": planned, "actual": None, "pct": None, "status": None}
    pct = float(actual / planned * 100) if planned else (100.0 if actual else 0.0)
    return {"planned": planned, "actual": actual, "pct": min(pct, 999), "status": _status(section, pct)}


def compute_summary(items: list[CashflowPlanItem], actuals: dict[str, Decimal] | None = None) -> dict:
    income_total = sum((item.amount for item in items if item.section == "income"), Decimal("0"))
    fixed_total = sum((item.amount for item in items if item.section == "fixed"), Decimal("0"))
    variable_total = sum((item.amount for item in items if item.section == "variable"), Decimal("0"))
    irregular_total = sum((item.amount for item in items if item.section == "irregular"), Decimal("0"))
    expense_total = fixed_total + variable_total + irregular_total
    actuals = actuals or {}

    return {
        "income": _section_summary("income", income_total, actuals.get("income")),
        "fixed": _section_summary("fixed", fixed_total, actuals.get("fixed")),
        "variable": _section_summary("variable", variable_total, actuals.get("variable")),
        "irregular": _section_summary("irregular", irregular_total, actuals.get("irregular")),
        "expense_total": expense_total,
        "available": income_total - expense_total,
    }
