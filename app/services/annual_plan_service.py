import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.annual_plan_item import AnnualPlanItem
from app.models.annual_plan_item_monthly_target import AnnualPlanItemMonthlyTarget
from app.services import budget_service, plan_targets, transaction_report_service
from app.utils.dates import year_bounds, year_month_of
from app.utils.plan_status import pct_of

SECTIONS = ("income", "fixed", "variable", "irregular")


def list_items(db: Session, year: int, section: str | None = None) -> list[AnnualPlanItem]:
    query = (
        db.query(AnnualPlanItem)
        .options(selectinload(AnnualPlanItem.monthly_targets))
        .filter(AnnualPlanItem.year == year)
    )
    if section is not None:
        query = query.filter(AnnualPlanItem.section == section)
    return query.order_by(AnnualPlanItem.section, AnnualPlanItem.sort_order).all()


def monthly_targets_for_month(db: Session, year_month: str) -> list[tuple[AnnualPlanItem, Decimal]]:
    """그 달에 값이 설정된 모든 AnnualPlanItem과 해당 월의 **실제 계획 금액**(반복거래 연동 시 그 금액)
    쌍을 (section, sort_order) 순으로 반환한다 — 이번 달 계획 화면(cashflow_plan_service.list_items)의 소스."""
    year = int(year_month[:4])
    rows = (
        db.query(AnnualPlanItem, AnnualPlanItemMonthlyTarget.target_amount)
        .join(AnnualPlanItemMonthlyTarget, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
        .filter(AnnualPlanItem.year == year, AnnualPlanItemMonthlyTarget.year_month == year_month)
        .order_by(AnnualPlanItem.section, AnnualPlanItem.sort_order, AnnualPlanItem.id)
        .all()
    )
    return [(item, item.amount_for(target)) for item, target in rows]


def set_month_target(item: AnnualPlanItem, year_month: str, amount: Decimal) -> None:
    """항목의 한 달 target만 바꾸거나 새로 만든다(나머지 달은 그대로). 적용 기간(start/end_month)
    밖의 달이면 기간을 그 달까지 넓힌다 — 이번 달 계획 화면에서 연간 항목의 한 달만 조정하는 경로."""
    for mt in item.monthly_targets:
        if mt.year_month == year_month:
            mt.target_amount = amount
            break
    else:
        item.monthly_targets.append(AnnualPlanItemMonthlyTarget(year_month=year_month, target_amount=amount))
    item.start_month = min(item.start_month, year_month)
    item.end_month = max(item.end_month, year_month)


def upsert_item(
    db: Session,
    id: int | None,
    year: int,
    section: str,
    owner_user_id: uuid.UUID | None,
    name: str,
    category_id: int | None,
    sort_order: int,
    updated_by: uuid.UUID,
    start_month: str,
    end_month: str,
    monthly_targets: list[dict] | None = None,
) -> AnnualPlanItem:
    item = db.get(AnnualPlanItem, id) if id is not None else None
    if item is None:
        item = AnnualPlanItem(year=year, section=section)
        db.add(item)
    else:
        item.year = year
        item.section = section
    item.owner_user_id = owner_user_id
    item.name = name
    item.category_id = category_id
    item.sort_order = sort_order
    item.updated_by = updated_by
    item.start_month = start_month
    item.end_month = end_month
    plan_targets.apply_monthly_targets(item, monthly_targets, AnnualPlanItemMonthlyTarget)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, id: int) -> bool:
    """대상 항목이 있으면 삭제하고 True, 없으면 False (라우터가 404로 변환)."""
    item = db.get(AnnualPlanItem, id)
    if item is None:
        return False
    db.delete(item)
    db.commit()
    return True


def item_to_out(item: AnnualPlanItem) -> dict:
    category = item.effective_category
    return {
        "id": item.id,
        "year": item.year,
        "section": item.section,
        "owner_user_id": item.owner_user_id,
        "name": item.name,
        "category_id": item.effective_category_id,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "sort_order": item.sort_order,
        "updated_at": item.updated_at,
        "start_month": item.start_month,
        "end_month": item.end_month,
        "installment_total": item.installment_total,
        "installment_total_amount": item.installment_total_amount,
        "recurring_expense_id": item.recurring_expense_id,
        "recurring_active": item.recurring_active,
        "annual_target": sum((item.amount_for(mt.target_amount) for mt in item.monthly_targets), Decimal("0")),
        "monthly_targets": [
            {"year_month": mt.year_month, "target_amount": item.amount_for(mt.target_amount)}
            for mt in item.monthly_targets
        ],
    }


def _section_monthly_targets(db: Session, year: int, section: str) -> dict[str, Decimal]:
    """그 섹션에 속한 모든 항목의 월별 목표금액을 월별로 합산한다 — 섹션 총액은 저장하지 않고
    항목 합으로 파생시킨다(이번 달 계획 compute_summary와 동일 원칙). 반복거래 연동 금액을 반영한다."""
    query = (
        db.query(AnnualPlanItemMonthlyTarget.year_month, func.sum(plan_targets.EFFECTIVE_TARGET_AMOUNT))
        .select_from(AnnualPlanItemMonthlyTarget)
        .join(AnnualPlanItem, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
    )
    rows = (
        plan_targets.join_recurring(query)
        .filter(AnnualPlanItem.year == year, AnnualPlanItem.section == section)
        .group_by(AnnualPlanItemMonthlyTarget.year_month)
        .all()
    )
    return {year_month: amount or Decimal("0") for year_month, amount in rows}


def section_summary(
    db: Session,
    year: int,
    section: str,
    today: date,
    breakdown: list[dict],
    warn_pct: float | None = None,
    critical_pct: float | None = None,
) -> dict:
    elapsed_months = plan_targets.elapsed_months(year, today)
    targets_by_month = _section_monthly_targets(db, year, section)

    monthly_out = []
    actual_total = Decimal("0")
    target_to_date = Decimal("0")
    for i, month in enumerate(range(1, 13)):
        year_month = year_month_of(year, month)
        target = targets_by_month.get(year_month, Decimal("0.00"))
        actual = breakdown[i][section] if i < elapsed_months else None
        pct = pct_of(actual, target, zero_planned_default=None) if actual is not None else None
        monthly_out.append(
            {
                "year_month": year_month,
                "target_amount": target,
                "actual": actual,
                "pct": pct,
                "status": plan_targets.budget_status(section, pct, warn_pct, critical_pct)
                if pct is not None
                else None,
            }
        )
        if actual is not None:
            actual_total += actual
            target_to_date += target

    annual_target = sum(targets_by_month.values(), Decimal("0"))
    pct = pct_of(actual_total, target_to_date, zero_planned_default=None)
    annual_pct = pct_of(actual_total, annual_target, zero_planned_default=None)
    return {
        "section": section,
        "elapsed_months": elapsed_months,
        "annual_target": annual_target,
        "target_to_date": target_to_date,
        "actual": actual_total,
        "pct": pct,
        "annual_pct": annual_pct,
        "status": plan_targets.budget_status(section, pct, warn_pct, critical_pct) if pct is not None else None,
        "monthly": monthly_out,
    }


def summary_for_year(
    db: Session, year: int, today: date, warn_pct: float | None = None, critical_pct: float | None = None
) -> dict:
    breakdown = transaction_report_service.yearly_monthly_breakdown(db, year)
    sections = {
        section: section_summary(db, year, section, today, breakdown, warn_pct, critical_pct)
        for section in SECTIONS
    }
    expense_total = sum(
        (sections[section]["annual_target"] for section in ("fixed", "variable", "irregular")), Decimal("0")
    )
    available = sections["income"]["annual_target"] - expense_total
    return {**sections, "expense_total": expense_total, "available": available}


def category_budgets_for_year(db: Session, year: int) -> dict[int, Decimal]:
    """카테고리가 있는 항목들의 12개월 목표금액을 카테고리별로 합산한다 —
    budget_service.get_budgets_for_month의 연간 버전(반복거래 연동 금액/카테고리 반영)."""
    query = (
        db.query(plan_targets.EFFECTIVE_CATEGORY_ID, func.sum(plan_targets.EFFECTIVE_TARGET_AMOUNT))
        .select_from(AnnualPlanItemMonthlyTarget)
        .join(AnnualPlanItem, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
    )
    rows = (
        plan_targets.join_recurring(query)
        .filter(AnnualPlanItem.year == year, plan_targets.EFFECTIVE_CATEGORY_ID.isnot(None))
        .group_by(plan_targets.EFFECTIVE_CATEGORY_ID)
        .all()
    )
    return dict(rows)


def category_budget_vs_actual(
    db: Session, year: int, warn_pct: float | None = None, critical_pct: float | None = None
) -> list[dict]:
    """budget_service.budget_vs_actual의 연간 버전 — 카테고리별 연간 목표금액 대비 그 해 전체
    실제 지출을 비교한다. 추세 제안값(suggested_amount)은 연 단위에서 의미가 없어 생략한다.
    행 골격·status 임계값은 budget_service.build_category_rows로 월간과 통일한다."""
    start, end = year_bounds(year)
    actuals = {
        row["category_id"]: row["amount"]
        for row in transaction_report_service.category_breakdown(db, start, end, "expense")
    }
    budgets = category_budgets_for_year(db, year)
    return budget_service.build_category_rows(db, actuals, budgets, warn_pct, critical_pct)
