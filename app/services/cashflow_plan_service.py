"""이번 달 계획 화면(`/cashflow-plan`)의 서비스. 별도 월간 테이블 없이 연간계획(AnnualPlanItem +
AnnualPlanItemMonthlyTarget)을 한 달 단면으로 읽고 쓴다 — 계획 원본은 하나뿐이라, 이번 달 화면에서 금액을
바꾸면 연간계획의 그 달 값이 바뀌고 예산 경고·코칭·알림(budget_service)도 같은 값을 본다."""

import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from sqlalchemy.orm import Session

from app.models.annual_plan_item import AnnualPlanItem
from app.models.annual_plan_item_monthly_target import AnnualPlanItemMonthlyTarget
from app.models.recurring_expense import RecurringExpense
from app.services import annual_plan_service, plan_targets, transaction_report_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_month_str
from app.utils.plan_status import pct_of


class RecurringExpenseNotFoundError(Exception):
    pass


@dataclass
class MonthPlanItem:
    """연간계획 항목의 한 달 단면 — CashflowPlanItemOut이 그대로 직렬화한다. id는 AnnualPlanItem.id."""

    id: int
    section: str
    year_month: str
    owner_user_id: uuid.UUID | None
    name: str
    amount: Decimal
    category_id: int | None
    category_name: str | None
    category_color: str | None
    sort_order: int
    installment_no: int | None
    installment_total: int | None
    installment_total_amount: Decimal | None
    recurring_expense_id: int | None
    recurring_active: bool | None
    # 이 항목이 그 달 말고도 다른 달에 금액을 갖고 있으면 true — 화면이 "연간계획" 배지를 띄워
    # 여기서 바꾸는 금액이 이번 달에만 적용된다는 걸 알린다.
    spans_multiple_months: bool


def _month_view(item: AnnualPlanItem, year_month: str, amount: Decimal) -> MonthPlanItem:
    category = item.effective_category
    return MonthPlanItem(
        id=item.id,
        section=item.section,
        year_month=year_month,
        owner_user_id=item.owner_user_id,
        name=item.name,
        amount=amount,
        category_id=item.effective_category_id,
        category_name=category.name if category else None,
        category_color=category.color if category else None,
        sort_order=item.sort_order,
        installment_no=item.installment_no_for(year_month),
        installment_total=item.installment_total,
        installment_total_amount=item.installment_total_amount,
        recurring_expense_id=item.recurring_expense_id,
        recurring_active=item.recurring_active,
        spans_multiple_months=len(item.monthly_targets) > 1,
    )


def list_items(db: Session, year_month: str) -> list[MonthPlanItem]:
    """그 달 금액이 있는 모든 계획 항목. 카테고리 태깅 여부는 `item.category_id`로 판단한다."""
    return [
        _month_view(item, year_month, amount)
        for item, amount in annual_plan_service.monthly_targets_for_month(db, year_month)
    ]


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
) -> AnnualPlanItem | None:
    """id가 없으면 그 달에만 금액이 있는 새 항목을 만든다. id가 있으면 항목 정보(이름·섹션·카테고리 등)는
    모든 달에 공통으로 바꾸고, 금액은 **그 달 target만** 바꾼다(다른 달 금액은 연간 화면에서).
    없는 id거나 다른 해의 항목이면 None(라우터가 404)."""
    year = int(year_month[:4])
    if id is None:
        item = AnnualPlanItem(year=year, start_month=year_month, end_month=year_month, monthly_targets=[])
        db.add(item)
    else:
        item = db.get(AnnualPlanItem, id)
        if item is None or item.year != year:
            return None
    item.section = section
    item.owner_user_id = owner_user_id
    item.name = name
    item.category_id = category_id
    item.sort_order = sort_order
    item.updated_by = updated_by
    annual_plan_service.set_month_target(item, year_month, amount)
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
) -> AnnualPlanItem:
    """총액을 `months`개월로 나눠 `start_year_month`부터 매월 금액을 가진 항목 하나를 만든다 (할부처럼 분할).
    나눗셈 나머지는 앞쪽 달부터 1원 단위로 얹어 합계가 총액과 정확히 일치하도록 한다 — KRW는
    소수점 단위가 없으므로 원 단위로 quantize한다. frontend/src/utils/monthRange.ts의
    distributeAmountEvenly()와 같은 나머지 보정 규칙이다. 호출부(라우터)는 그 해 남은 달 수만 넘기므로
    항목은 항상 한 해 안에 들어간다. 이후 각 달 금액은 이번 달/연간 화면에서 따로 조정할 수 있다."""
    unit = Decimal("1")
    base = (total_amount / months).quantize(unit, rounding=ROUND_DOWN)
    remainder_units = int((total_amount - base * months) / unit)

    start = parse_year_month(start_year_month)
    month_strs = [year_month_str(shift_month(start, i)) for i in range(months)]
    if month_strs[-1][:4] != month_strs[0][:4]:
        raise ValueError("할부 분할은 한 해 안에서만 가능합니다.")
    item = AnnualPlanItem(
        year=start.year,
        section=section,
        start_month=month_strs[0],
        end_month=month_strs[-1],
        owner_user_id=owner_user_id,
        name=name,
        category_id=category_id,
        sort_order=sort_order,
        installment_total=months,
        installment_total_amount=total_amount,
        installment_start_month=month_strs[0],
        updated_by=updated_by,
        monthly_targets=[
            AnnualPlanItemMonthlyTarget(
                year_month=ym, target_amount=base + (unit if i < remainder_units else Decimal("0"))
            )
            for i, ym in enumerate(month_strs)
        ],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def link_recurring(db: Session, item_id: int, recurring_expense_id: int) -> AnnualPlanItem | None:
    """계획 항목을 이미 존재하는 반복거래에 연결한다. FK만 세팅하면 이후 그 항목의 모든 달 금액/카테고리는
    연동된 RecurringExpense의 값을 read-through로 반영한다(AnnualPlanItem.amount_for 참고) — 반복거래 금액을
    바꾸면 별도 동기화 없이 계획에도 즉시 반영된다.

    "찾을 수 없음"이 세 가지 방식으로 갈리는 건 각기 다른 원인/상태를 라우터가 구분해서 응답하기 위한
    의도된 설계다 (app/services/CLAUDE.md의 컨벤션 참고): 주 리소스(path param인 item_id)가 없으면
    None을 반환해 라우터가 404로 변환하고, 요청 바디로 참조한 보조 리소스(recurring_expense_id)가 없으면
    전용 예외(RecurringExpenseNotFoundError)를 던져 원인이 다른 404임을 구분하며, 이미 연결된 상태 충돌은
    ValueError로 라우터가 409로 변환한다."""
    item = db.get(AnnualPlanItem, item_id)
    if item is None:
        return None
    if item.recurring_expense_id is not None:
        raise ValueError("이미 반복내역에 연결된 항목입니다.")
    recurring = db.get(RecurringExpense, recurring_expense_id)
    if recurring is None:
        raise RecurringExpenseNotFoundError("반복내역을 찾을 수 없습니다.")
    item.recurring_expense_id = recurring_expense_id
    # 연동이 끊겼을 때(SET NULL) 되돌아갈 카테고리도 최근 연동 값으로 맞춰 둔다.
    item.category_id = recurring.category_id
    db.commit()
    db.refresh(item)
    return item


def delete_month(db: Session, item_id: int, year_month: str) -> bool:
    """항목의 그 달 금액만 지운다 — 다른 달이 남아 있으면 항목은 유지하고, 마지막 달이면 항목째 삭제한다.
    지운 게 있으면 True, 없는 항목이거나 그 달 금액이 없으면 False(라우터가 404로 바꾼다)."""
    item = db.get(AnnualPlanItem, item_id)
    if item is None:
        return False
    remaining = [mt for mt in item.monthly_targets if mt.year_month != year_month]
    if len(remaining) == len(item.monthly_targets):
        return False
    if remaining:
        item.monthly_targets = remaining
        item.start_month = remaining[0].year_month
        item.end_month = remaining[-1].year_month
    else:
        db.delete(item)
    db.commit()
    return True


def _item_key(item: AnnualPlanItem) -> tuple:
    """연도가 다른 항목끼리 "같은 항목"인지 판정하는 키 — (section, category_id, name). 이름까지 비교해야
    같은 카테고리를 쓰는 서로 다른 항목(예: 저축 카테고리의 "비상금"과 "청약저축")이 서로를 가리지 않는다."""
    return (item.section, item.category_id, item.name)


def _budget_line_key(section: str, category_id: int | None, name: str) -> tuple:
    """copy_from_previous_month의 중복 판정 키 — 카테고리 태깅 항목은 (section, category_id)로 "카테고리당
    한 줄"이라는 예산 라인 개념이라 이름이 달라도 중복으로 본다. 자유 텍스트 항목은 (section, name)."""
    if category_id is not None:
        return (section, category_id)
    return (section, name)


def copy_from_previous_month(db: Session, year_month: str, updated_by: uuid.UUID) -> int:
    """전월에 금액이 있고 이번 달엔 같은 줄(_budget_line_key)이 없는 항목의 금액을 이번 달로 복사한다. 같은 해면 같은 항목에 이번 달
    금액만 더하고, 1월로 복사할 때(전월이 작년)는 올해의 같은 항목(_item_key)을 찾아 쓰거나 새로 만든다
    (반복거래 연동도 이어받는다). 복사한 항목 수를 반환한다."""
    this_month_start = parse_year_month(year_month)
    prev_month_str = year_month_str(shift_month(this_month_start, -1))
    year = this_month_start.year
    this_month_keys = {_budget_line_key(i.section, i.category_id, i.name) for i in list_items(db, year_month)}
    this_year_by_key = {_item_key(item): item for item in annual_plan_service.list_items(db, year)}
    copied = 0
    for prev_item, _ in annual_plan_service.monthly_targets_for_month(db, prev_month_str):
        line_key = _budget_line_key(prev_item.section, prev_item.effective_category_id, prev_item.name)
        if line_key in this_month_keys:
            continue
        stored = next(mt.target_amount for mt in prev_item.monthly_targets if mt.year_month == prev_month_str)
        if prev_item.year == year:
            target = prev_item
        else:
            target = this_year_by_key.get(_item_key(prev_item))
            if target is None:
                target = AnnualPlanItem(
                    year=year,
                    section=prev_item.section,
                    start_month=year_month,
                    end_month=year_month,
                    owner_user_id=prev_item.owner_user_id,
                    name=prev_item.name,
                    category_id=prev_item.category_id,
                    sort_order=prev_item.sort_order,
                    recurring_expense_id=prev_item.recurring_expense_id,
                    monthly_targets=[],
                )
                db.add(target)
                this_year_by_key[_item_key(target)] = target
        if any(mt.year_month == year_month for mt in target.monthly_targets):
            continue
        annual_plan_service.set_month_target(target, year_month, stored)
        target.updated_by = updated_by
        this_month_keys.add(line_key)
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
    items: list[MonthPlanItem],
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
