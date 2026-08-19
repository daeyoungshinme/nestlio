import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.annual_plan_item import AnnualPlanItem
from app.models.annual_plan_item_monthly_target import AnnualPlanItemMonthlyTarget
from app.models.category import Category
from app.services import transaction_report_service
from app.utils.dates import year_bounds
from app.utils.plan_status import pct_of, status_from_pct

SECTIONS = ("income", "fixed", "variable", "irregular")


def list_items(db: Session, year: int, section: str | None = None) -> list[AnnualPlanItem]:
    query = db.query(AnnualPlanItem).filter(AnnualPlanItem.year == year)
    if section is not None:
        query = query.filter(AnnualPlanItem.section == section)
    return query.order_by(AnnualPlanItem.section, AnnualPlanItem.sort_order).all()


def monthly_targets_for_month(db: Session, year_month: str) -> list[tuple[AnnualPlanItem, Decimal]]:
    """그 달에 값이 설정된 모든 AnnualPlanItem과 해당 월 목표금액 쌍을 반환한다 —
    savings_product_service._monthly_targets_by_product_for_year와 동일 패턴. cashflow_plan_service가
    이번 달 계획에 값이 없는 항목을 연간계획 값으로 자동 채우는 폴백에 쓴다."""
    year = int(year_month[:4])
    return (
        db.query(AnnualPlanItem, AnnualPlanItemMonthlyTarget.target_amount)
        .join(AnnualPlanItemMonthlyTarget, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
        .filter(AnnualPlanItem.year == year, AnnualPlanItemMonthlyTarget.year_month == year_month)
        .all()
    )


def _apply_monthly_targets(item: AnnualPlanItem, monthly_targets: list[dict] | None) -> None:
    """year_month로 기존 행을 매칭해 target_amount만 갱신하고, 새 월은 새로 만든다 —
    goal_service._apply_monthly_targets와 동일 패턴. 빠진 월은 목록에서 제외돼 delete-orphan으로
    삭제된다."""
    existing_by_month = {mt.year_month: mt for mt in item.monthly_targets}
    new_targets: list[AnnualPlanItemMonthlyTarget] = []
    for entry in monthly_targets or []:
        year_month = entry["year_month"]
        existing = existing_by_month.get(year_month)
        if existing is not None:
            existing.target_amount = entry["target_amount"]
            new_targets.append(existing)
        else:
            new_targets.append(AnnualPlanItemMonthlyTarget(year_month=year_month, target_amount=entry["target_amount"]))
    item.monthly_targets = new_targets


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
    _apply_monthly_targets(item, monthly_targets)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, id: int) -> None:
    item = db.get(AnnualPlanItem, id)
    if item is not None:
        db.delete(item)
        db.commit()


def item_to_out(item: AnnualPlanItem) -> dict:
    return {
        "id": item.id,
        "year": item.year,
        "section": item.section,
        "owner_user_id": item.owner_user_id,
        "name": item.name,
        "category_id": item.category_id,
        "category_name": item.category.name if item.category else None,
        "category_color": item.category.color if item.category else None,
        "sort_order": item.sort_order,
        "updated_at": item.updated_at,
        "start_month": item.start_month,
        "end_month": item.end_month,
        "annual_target": sum((mt.target_amount for mt in item.monthly_targets), Decimal("0")),
        "monthly_targets": [
            {"year_month": mt.year_month, "target_amount": mt.target_amount} for mt in item.monthly_targets
        ],
    }


def _elapsed_months(year: int, today: date) -> int:
    if year < today.year:
        return 12
    if year > today.year:
        return 0
    return today.month


def _status(section: str, pct: float) -> str:
    """지출 3섹션(fixed/variable/irregular)은 실적이 계획을 초과할수록 위험, income은 반대(실적이
    계획에 못 미칠수록 위험)이므로 cashflow_plan_service._status와 동일하게 invert를 나눈다."""
    return status_from_pct(pct, settings.budget_warn_pct, settings.budget_critical_pct, invert=(section == "income"))


def _section_monthly_targets(db: Session, year: int, section: str) -> dict[str, Decimal]:
    """그 섹션에 속한 모든 항목의 월별 목표금액을 월별로 합산한다 — 섹션 총액은 저장하지 않고
    항목 합으로 파생시킨다(월간 CashflowPlanItem.compute_summary와 동일 원칙)."""
    rows = (
        db.query(AnnualPlanItemMonthlyTarget.year_month, func.sum(AnnualPlanItemMonthlyTarget.target_amount))
        .join(AnnualPlanItem, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
        .filter(AnnualPlanItem.year == year, AnnualPlanItem.section == section)
        .group_by(AnnualPlanItemMonthlyTarget.year_month)
        .all()
    )
    return {year_month: amount or Decimal("0") for year_month, amount in rows}


def section_summary(db: Session, year: int, section: str, today: date) -> dict:
    elapsed_months = _elapsed_months(year, today)
    targets_by_month = _section_monthly_targets(db, year, section)
    breakdown = transaction_report_service.yearly_monthly_breakdown(db, year)

    monthly_out = []
    actual_total = Decimal("0")
    target_to_date = Decimal("0")
    for i, month in enumerate(range(1, 13)):
        year_month = f"{year}-{month:02d}"
        target = targets_by_month.get(year_month, Decimal("0.00"))
        actual = breakdown[i][section] if i < elapsed_months else None
        pct = pct_of(actual, target, zero_planned_default=None) if actual is not None else None
        monthly_out.append(
            {
                "year_month": year_month,
                "target_amount": target,
                "actual": actual,
                "pct": pct,
                "status": _status(section, pct) if pct is not None else None,
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
        "status": _status(section, pct) if pct is not None else None,
        "monthly": monthly_out,
    }


def summary_for_year(db: Session, year: int, today: date) -> dict:
    sections = {section: section_summary(db, year, section, today) for section in SECTIONS}
    expense_total = sum(
        (sections[section]["annual_target"] for section in ("fixed", "variable", "irregular")), Decimal("0")
    )
    available = sections["income"]["annual_target"] - expense_total
    return {**sections, "expense_total": expense_total, "available": available}


def category_budgets_for_year(db: Session, year: int) -> dict[int, Decimal]:
    """AnnualPlanItem.category_id가 있는 항목들의 12개월 목표금액을 카테고리별로 합산한다 —
    budget_service.get_budgets_for_month의 연간 버전(소스 테이블만 CashflowPlanItem -> AnnualPlanItem)."""
    rows = (
        db.query(AnnualPlanItem.category_id, func.sum(AnnualPlanItemMonthlyTarget.target_amount))
        .join(AnnualPlanItemMonthlyTarget, AnnualPlanItemMonthlyTarget.item_id == AnnualPlanItem.id)
        .filter(AnnualPlanItem.year == year, AnnualPlanItem.category_id.isnot(None))
        .group_by(AnnualPlanItem.category_id)
        .all()
    )
    return {category_id: total for category_id, total in rows}


def category_budget_vs_actual(db: Session, year: int) -> list[dict]:
    """budget_service.budget_vs_actual의 연간 버전 — 카테고리별 연간 목표금액 대비 그 해 전체
    실제 지출을 비교한다. 추세 제안값(suggested_amount)은 연 단위에서 의미가 없어 생략한다."""
    start, end = year_bounds(year)
    actuals = {
        row["category_id"]: row["amount"]
        for row in transaction_report_service.category_breakdown(db, start, end, "expense")
    }
    budgets = category_budgets_for_year(db, year)
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
                "status": _status(cat.type, pct) if budget_amount else ("warn" if actual else "ok"),
            }
        )
    return result
