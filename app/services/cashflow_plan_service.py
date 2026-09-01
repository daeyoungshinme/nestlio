import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from sqlalchemy.orm import Session

from app.models.cashflow_plan_item import CashflowPlanItem
from app.models.recurring_expense import RecurringExpense
from app.services import annual_plan_service, plan_targets, transaction_report_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str
from app.utils.plan_status import pct_of

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
    annual_plan_item_id: int | None = None,
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
            annual_plan_item_id=annual_plan_item_id,
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
        if annual_plan_item_id is not None:
            item.annual_plan_item_id = annual_plan_item_id
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
    나눗셈 나머지는 앞쪽 달부터 1원 단위로 얹어 합계가 총액과 정확히 일치하도록 한다 — KRW는
    소수점 단위가 없으므로 원 단위로 quantize한다. frontend/src/utils/monthRange.ts의
    distributeAmountEvenly()와 같은 나머지 보정 규칙이다.
    생성된 각 행은 이후 서로 독립적으로 수정/삭제된다 (그룹 전체에 영향 없음)."""
    unit = Decimal("1")
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
    같은 카테고리를 이름이 다른 두 항목으로 중복 복사하지 않기 위함 (copy_from_previous_month 전용:
    카테고리 태깅 항목은 "카테고리당 한 줄"이라는 예산 라인 개념이라 이름이 달라도 중복으로 보지 않는다).
    AnnualPlanItem도 section/category_id/name 속성을 그대로 갖고 있어 이 함수를 duck typing으로 재사용할
    수 있지만, list_items_with_annual_fallback은 이 함수 대신 이름까지 비교하는 _annual_fallback_key()를
    쓴다 — 그쪽은 연간계획에 등록된 서로 다른 항목이 같은 카테고리를 공유해도 각자 노출돼야 하기 때문이다."""
    if item.category_id is not None:
        return (item.section, item.category_id)
    return (item.section, item.name)


def _annual_fallback_key(item) -> tuple:
    """list_items_with_annual_fallback 전용 매칭 키. _item_key와 달리 카테고리 태깅 항목도 이름까지
    포함한 (section, category_id, name)을 쓴다 — category_id만으로 매칭하면 같은 카테고리를 쓰는 서로
    다른 이름의 연간계획 항목이 전부 가려지는 버그가 있었다(예: 이번 달 계획에 저축 카테고리로 "비상금"이
    수기 등록돼 있으면 같은 카테고리인 연간계획의 "청약저축"까지 이름이 다름에도 통째로 가려짐)."""
    return (item.section, item.category_id, item.name)


@dataclass
class _AnnualPlanFallbackItem:
    """연간계획에는 월별 금액이 있지만 그 달 CashflowPlanItem이 아직 없을 때 조회 시점에만 만들어 끼워 넣는
    가상 항목. CashflowPlanItem과 같은 속성 이름을 가져 compute_summary/CashflowPlanItemOut 양쪽에서
    실제 항목과 구분 없이 다뤄진다 — 저장된 적이 없으므로 id는 None, from_annual_plan만 true로 표시한다."""

    section: str
    year_month: str
    owner_user_id: uuid.UUID | None
    name: str
    amount: Decimal
    category_id: int | None
    category_name: str | None
    category_color: str | None
    sort_order: int
    id: int | None = None
    installment_no: int | None = None
    installment_total: int | None = None
    installment_total_amount: Decimal | None = None
    recurring_expense_id: int | None = None
    recurring_active: bool | None = None
    from_annual_plan: bool = True
    annual_plan_item_id: int | None = None


def list_items_with_annual_fallback(db: Session, year_month: str) -> list[CashflowPlanItem | _AnnualPlanFallbackItem]:
    """이번 달 계획 목록 = 실제 CashflowPlanItem + (아직 그 달에 없는 항목만) 연간계획 월별 금액으로 채운
    가상 항목. 이미 실제 항목이 있는 연간계획 항목은 건드리지 않는다 — 사용자가 한 번 수정해서 저장하면
    그 순간부터 실제 항목이 되어 이후 연간계획을 바꿔도 그 달 값은 그대로 유지된다.

    "이미 실제 항목이 있다"는 우선 실제 항목의 annual_plan_item_id(승격 시 upsert_item이 저장)로 판정한다 —
    이러면 연간계획 항목의 이름/카테고리가 나중에 바뀌어도 승격된 행과의 연결이 끊기지 않는다(과거 버그: 자유
    텍스트 항목은 이름을, 태깅 항목은 카테고리를 키로 매칭해 이름을 바꾸면 승격된 행을 못 찾아 중복 폴백이
    생기거나, 반대로 무관한 실제 항목이 같은 카테고리를 써서 새 이름의 연간계획 값이 영구히 가려졌다).
    annual_plan_item_id로 연결되지 않은(연간계획과 무관하게 독립적으로 만들어진) 실제 항목에 한해서만
    _annual_fallback_key()((section, category_id, name) — 카테고리와 이름이 모두 같아야 매칭)로 대체
    매칭한다. category_id만으로 매칭하면 같은 카테고리를 쓰는 다른 이름의 연간계획 항목까지 전부
    가려지므로 이름도 함께 비교한다."""
    items = list_items(db, year_month)
    linked_annual_ids = {item.annual_plan_item_id for item in items if item.annual_plan_item_id is not None}
    existing_keys = {_annual_fallback_key(item) for item in items if item.annual_plan_item_id is None}
    fallback_items: list[_AnnualPlanFallbackItem] = []
    for annual_item, target_amount in annual_plan_service.monthly_targets_for_month(db, year_month):
        if annual_item.id in linked_annual_ids or _annual_fallback_key(annual_item) in existing_keys:
            continue
        fallback_items.append(
            _AnnualPlanFallbackItem(
                section=annual_item.section,
                year_month=year_month,
                owner_user_id=annual_item.owner_user_id,
                name=annual_item.name,
                amount=target_amount,
                category_id=annual_item.category_id,
                category_name=annual_item.category.name if annual_item.category else None,
                category_color=annual_item.category.color if annual_item.category else None,
                sort_order=annual_item.sort_order,
                annual_plan_item_id=annual_item.id,
            )
        )
    merged: list[CashflowPlanItem | _AnnualPlanFallbackItem] = [*items, *fallback_items]
    merged.sort(key=lambda i: (i.section, i.sort_order))
    return merged


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


def suggested_totals(db: Session, year_month: str) -> dict[str, Decimal]:
    """직전 3개월 실적 평균 — 부진한 섹션에 다음 달 계획 제안값으로 쓰인다."""
    month_start = parse_year_month(year_month)
    return transaction_report_service.trailing_average_by_section(db, month_start, months=3)


def _section_summary(
    section: str,
    planned: Decimal,
    actual: Decimal | None,
    suggested_amount: Decimal | None = None,
    warn_pct: float | None = None,
    critical_pct: float | None = None,
) -> dict:
    if actual is None:
        return {"planned": planned, "actual": None, "pct": None, "status": None, "suggested_amount": None}
    pct = pct_of(actual, planned)
    return {
        "planned": planned,
        "actual": actual,
        "pct": pct,
        "status": plan_targets.budget_status(section, pct, warn_pct, critical_pct),
        "suggested_amount": suggested_amount,
    }


def compute_summary(
    items: list[CashflowPlanItem],
    actuals: dict[str, Decimal] | None = None,
    suggested: dict[str, Decimal] | None = None,
    warn_pct: float | None = None,
    critical_pct: float | None = None,
) -> dict:
    income_total = sum((item.amount for item in items if item.section == "income"), Decimal("0"))
    fixed_total = sum((item.amount for item in items if item.section == "fixed"), Decimal("0"))
    variable_total = sum((item.amount for item in items if item.section == "variable"), Decimal("0"))
    irregular_total = sum((item.amount for item in items if item.section == "irregular"), Decimal("0"))
    expense_total = fixed_total + variable_total + irregular_total
    actuals = actuals or {}
    suggested = suggested or {}

    return {
        "income": _section_summary(
            "income", income_total, actuals.get("income"), suggested.get("income"), warn_pct, critical_pct
        ),
        "fixed": _section_summary(
            "fixed", fixed_total, actuals.get("fixed"), suggested.get("fixed"), warn_pct, critical_pct
        ),
        "variable": _section_summary(
            "variable", variable_total, actuals.get("variable"), suggested.get("variable"), warn_pct, critical_pct
        ),
        "irregular": _section_summary(
            "irregular", irregular_total, actuals.get("irregular"), suggested.get("irregular"), warn_pct, critical_pct
        ),
        "expense_total": expense_total,
        "available": income_total - expense_total,
    }
