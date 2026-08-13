import uuid
from decimal import ROUND_DOWN, Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.cashflow_plan_item import CashflowPlanItem
from app.models.recurring_expense import RecurringExpense
from app.services import transaction_report_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str
from app.utils.plan_status import pct_of, status_from_pct

EXPENSE_SECTIONS = ("fixed", "variable", "irregular")
ACHIEVEMENT_SECTIONS = ("income", "fixed", "variable", "irregular")


class RecurringExpenseNotFoundError(Exception):
    pass


def list_items(db: Session, year_month: str) -> list[CashflowPlanItem]:
    """해당 월의 모든 계획 항목을 반환한다 — 자유 텍스트 항목과 카테고리 태깅 항목(구 budget_service
    전용 행) 구분 없이 하나의 목록으로 합쳐서 다룬다. 카테고리 태깅 여부는 `item.category_id`로 판단한다."""
    return (
        db.query(CashflowPlanItem)
        .filter(CashflowPlanItem.year_month == year_month)
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
    category_id: int | None = None,
) -> CashflowPlanItem:
    item = db.get(CashflowPlanItem, id) if id is not None else None
    if item is None:
        item = CashflowPlanItem(
            section=section,
            year_month=year_month,
            owner_user_id=owner_user_id,
            name=name,
            own_amount=amount,
            own_category_id=category_id,
            sort_order=sort_order,
            updated_by=updated_by,
        )
        db.add(item)
    else:
        item.section = section
        item.owner_user_id = owner_user_id
        item.name = name
        item.own_amount = amount
        item.own_category_id = category_id
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
    category_id: int | None = None,
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
            own_amount=amount,
            own_category_id=category_id,
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


def link_recurring(db: Session, item_id: int, recurring_expense_id: int) -> CashflowPlanItem | None:
    """계획 항목을 이미 존재하는 반복거래에 연결한다. FK만 세팅하면 이후 item.amount/category_id는
    연동된 RecurringExpense의 값을 계속 read-through로 반영한다(CashflowPlanItem.amount 프로퍼티 참고) —
    반복거래 금액을 바꾸면 별도 동기화 없이 계획에도 즉시 반영된다.

    "찾을 수 없음"이 세 가지 방식으로 갈리는 건 각기 다른 원인/상태를 라우터가 구분해서 응답하기 위한
    의도된 설계다 (app/services/CLAUDE.md의 컨벤션 참고): 주 리소스(path param인 item_id)가 없으면
    None을 반환해 라우터가 404로 변환하고, 요청 바디로 참조한 보조 리소스(recurring_expense_id)가 없으면
    전용 예외(RecurringExpenseNotFoundError)를 던져 원인이 다른 404임을 구분하며, 이미 연결된 상태 충돌은
    ValueError로 라우터가 409로 변환한다."""
    item = db.get(CashflowPlanItem, item_id)
    if item is None:
        return None
    if item.recurring_expense_id is not None:
        raise ValueError("이미 반복내역에 연결된 항목입니다.")
    recurring = db.get(RecurringExpense, recurring_expense_id)
    if recurring is None:
        raise RecurringExpenseNotFoundError("반복내역을 찾을 수 없습니다.")
    item.recurring_expense_id = recurring_expense_id
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, id: int) -> None:
    item = db.get(CashflowPlanItem, id)
    if item is not None:
        db.delete(item)
        db.commit()


def _item_key(item: CashflowPlanItem) -> tuple:
    """카테고리 태깅 항목은 (section, category_id)로, 자유 텍스트 항목은 (section, name)으로 식별한다 —
    같은 카테고리를 이름이 다른 두 항목으로 중복 복사하지 않기 위함."""
    if item.category_id is not None:
        return (item.section, item.category_id)
    return (item.section, item.name)


def copy_from_previous_month(db: Session, year_month: str, updated_by: uuid.UUID) -> int:
    """Copy previous month's plan items into `year_month` for (section, category_id-or-name) combos
    missing there. Returns count copied."""
    this_month_start = parse_year_month(year_month)
    prev_month_str = year_month_str(shift_month(this_month_start, -1))
    prev_items = list_items(db, prev_month_str)
    existing_keys = {_item_key(item) for item in list_items(db, year_month)}
    copied = 0
    for item in prev_items:
        if _item_key(item) in existing_keys:
            continue
        db.add(
            CashflowPlanItem(
                section=item.section,
                year_month=year_month,
                owner_user_id=item.owner_user_id,
                name=item.name,
                own_amount=item.amount,
                own_category_id=item.category_id,
                sort_order=item.sort_order,
                recurring_expense_id=item.recurring_expense_id,
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
    totals = transaction_report_service.period_totals(db, start, end)
    return {
        "income": totals["income"],
        "fixed": totals["fixed"],
        "variable": totals["variable"],
        "irregular": totals["irregular"],
    }


def _status(section: str, pct: float) -> str:
    """fixed/variable: 실적이 계획을 초과할수록 위험. income은 방향이 반대(실적이 계획에 못 미칠수록 위험)이므로
    미달분(100-pct)을 같은 임계값과 비교한다 (예: pct<=100-90=10일 때 warn, pct<=100-100=0일 때 critical)."""
    return status_from_pct(pct, settings.budget_warn_pct, settings.budget_critical_pct, invert=(section == "income"))


def _section_summary(section: str, planned: Decimal, actual: Decimal | None) -> dict:
    if actual is None:
        return {"planned": planned, "actual": None, "pct": None, "status": None}
    pct = pct_of(actual, planned)
    return {"planned": planned, "actual": actual, "pct": pct, "status": _status(section, pct)}


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
