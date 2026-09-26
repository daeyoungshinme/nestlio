from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.savings_product import SavingsProduct
from app.models.savings_product_annual_plan import SavingsProductAnnualPlan
from app.models.savings_product_annual_plan_monthly_target import SavingsProductAnnualPlanMonthlyTarget
from app.models.transaction import Transaction
from app.services import plan_targets, savings_product_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_bounds, year_month_of
from app.utils.plan_status import pct_of

PLAN_PRODUCT_TYPES = ("savings", "investment")


def actuals_for_month(db: Session, year_month: str) -> dict[int, Decimal]:
    """이번 달 각 저축/투자 상품에 연결된 지출 거래(Transaction.savings_product_id)의 합.
    저축상품 연결 거래는 type='expense'만 허용되므로(transaction_service._validate_savings_link)
    별도 type 필터가 필요 없다."""
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)
    rows = (
        db.query(Transaction.savings_product_id, func.sum(Transaction.amount))
        .filter(
            Transaction.savings_product_id.isnot(None),
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .group_by(Transaction.savings_product_id)
        .all()
    )
    return dict(rows)


def trailing_average_actuals(db: Session, year_month: str, months: int = 3) -> dict[int, Decimal]:
    """`year_month` 직전 `months`개월 동안 상품별 실제 납입액 평균 — 부진한 상품의 다음 달 계획
    제안값으로 쓰인다. 직전 N개월치를 달마다 조회하지 않고 한 번의 범위 쿼리로 집계한다."""
    month_start = parse_year_month(year_month)
    window_start, _ = month_bounds(shift_month(month_start, -months))
    _, window_end = month_bounds(shift_month(month_start, -1))
    rows = (
        db.query(Transaction.savings_product_id, func.sum(Transaction.amount))
        .filter(
            Transaction.savings_product_id.isnot(None),
            Transaction.transaction_date >= window_start,
            Transaction.transaction_date <= window_end,
        )
        .group_by(Transaction.savings_product_id)
        .all()
    )
    return {product_id: total / months for product_id, total in rows}


def get_annual_plan(db: Session, product_id: int, year: int) -> dict | None:
    """저장된 SavingsProductAnnualPlan이 있으면 그대로, 없으면 1~12월 전체를
    product.monthly_saving_amount로 채운 기본값을 저장 없이 구성해 반환한다 — 편집 폼을 열면 "지금
    유효한 계획"이 이미 채워진 채로 시작하도록 하기 위함."""
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    plan = (
        db.query(SavingsProductAnnualPlan)
        .filter(SavingsProductAnnualPlan.product_id == product_id, SavingsProductAnnualPlan.year == year)
        .first()
    )
    if plan is not None:
        return {
            "product_id": product_id,
            "year": year,
            "start_month": plan.start_month,
            "end_month": plan.end_month,
            "monthly_targets": [
                {"year_month": mt.year_month, "target_amount": mt.target_amount} for mt in plan.monthly_targets
            ],
        }
    return {
        "product_id": product_id,
        "year": year,
        "start_month": year_month_of(year, 1),
        "end_month": year_month_of(year, 12),
        "monthly_targets": [
            {"year_month": year_month_of(year, month), "target_amount": product.monthly_saving_amount}
            for month in range(1, 13)
        ],
    }


def upsert_annual_plan(
    db: Session,
    product_id: int,
    year: int,
    start_month: str,
    end_month: str,
    monthly_targets: list[dict] | None = None,
) -> SavingsProductAnnualPlan | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    plan = (
        db.query(SavingsProductAnnualPlan)
        .filter(SavingsProductAnnualPlan.product_id == product_id, SavingsProductAnnualPlan.year == year)
        .first()
    )
    if plan is None:
        plan = SavingsProductAnnualPlan(product_id=product_id, year=year)
        db.add(plan)
    plan.start_month = start_month
    plan.end_month = end_month
    plan_targets.apply_monthly_targets(plan, monthly_targets, SavingsProductAnnualPlanMonthlyTarget)
    db.commit()
    db.refresh(plan)
    return plan


def _monthly_targets_by_product_for_year(db: Session, product_ids: list[int], year: int) -> dict[int, dict[str, Decimal]]:
    """product_id별로 그 연도에 저장된 월별 목표금액(year_month -> target_amount)을 한 번에 조회한다
    (compute_plan_summary/compute_annual_plan_summary가 상품마다 따로 조회하지 않도록)."""
    if not product_ids:
        return {}
    rows = (
        db.query(
            SavingsProductAnnualPlan.product_id,
            SavingsProductAnnualPlanMonthlyTarget.year_month,
            SavingsProductAnnualPlanMonthlyTarget.target_amount,
        )
        .join(SavingsProductAnnualPlanMonthlyTarget, SavingsProductAnnualPlanMonthlyTarget.plan_id == SavingsProductAnnualPlan.id)
        .filter(SavingsProductAnnualPlan.product_id.in_(product_ids), SavingsProductAnnualPlan.year == year)
        .all()
    )
    result: dict[int, dict[str, Decimal]] = {}
    for product_id, year_month, target_amount in rows:
        result.setdefault(product_id, {})[year_month] = target_amount
    return result


def _plan_group(
    planned: Decimal, actual: Decimal, warn_pct: float | None = None, critical_pct: float | None = None
) -> dict:
    pct = pct_of(actual, planned, zero_planned_default=None)
    return {
        "planned": planned,
        "actual": actual,
        "pct": pct,
        "status": plan_targets.savings_status(pct, warn_pct, critical_pct) if pct is not None else None,
    }


def plan_products(db: Session) -> list[SavingsProduct]:
    return [p for p in savings_product_service.list_products(db) if p.product_type in PLAN_PRODUCT_TYPES]


def planned_by_product_for_month(
    db: Session, year_month: str, products: list[SavingsProduct] | None = None
) -> dict[int, Decimal]:
    """상품별 그 달 저축·투자 계획액 — "얼마 저축할지"의 **유일한 원본**이다. SavingsProductAnnualPlan(월별
    그리드)에 값이 있으면 그 값을, 없으면 product.monthly_saving_amount로 폴백한다. 목표의 월 계획액
    (goal_progress_service.planned_monthly_for_goal)과 코칭의 목표 페이스·연속 달성(coaching_engine)도
    이 값을 쓴다."""
    products = plan_products(db) if products is None else products
    targets_by_product = _monthly_targets_by_product_for_year(db, [p.id for p in products], int(year_month[:4]))
    return {
        p.id: targets_by_product.get(p.id, {}).get(year_month, p.monthly_saving_amount) for p in products
    }


def plan_totals_for_month(db: Session, year_month: str) -> tuple[Decimal, Decimal]:
    """(그 달 저축·투자 계획 합계, 그 달 실제 납입 합계) — 부동산·비상금 상품은 계획 대상이 아니라 뺀다."""
    products = plan_products(db)
    planned = planned_by_product_for_month(db, year_month, products)
    actuals = actuals_for_month(db, year_month)
    return (
        sum(planned.values(), Decimal("0")),
        sum((actuals.get(p.id, Decimal("0")) for p in products), Decimal("0")),
    )


def compute_plan_summary(
    db: Session, year_month: str, warn_pct: float | None = None, critical_pct: float | None = None
) -> dict:
    """저축/투자(부동산 제외) 상품별 이번 달 계획 대비 실적(actuals_for_month)을 계산한다. 계획액은
    그 달이 속한 연도에 SavingsProductAnnualPlan(월별 그리드)이 설정돼 있으면 그 값을, 없으면
    product.monthly_saving_amount로 폴백한다(_monthly_targets_by_product_for_year). 이 함수 자체는
    읽기 전용 집계만 담당하고, 상품 추가/수정은 update_product 등 별도 함수가 맡는다."""
    products = plan_products(db)
    planned_by_product = planned_by_product_for_month(db, year_month, products)
    actuals = actuals_for_month(db, year_month)
    suggested = trailing_average_actuals(db, year_month, months=3)
    items = []
    planned_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    actual_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    for product in products:
        planned = planned_by_product[product.id]
        actual = actuals.get(product.id, Decimal("0"))
        group = _plan_group(planned, actual, warn_pct, critical_pct)
        items.append(
            {
                "id": product.id,
                "name": product.name,
                "product_type": product.product_type,
                "planned": group["planned"],
                "actual": group["actual"],
                "pct": group["pct"] if group["pct"] is not None else 0.0,
                "status": group["status"] if group["status"] is not None else "ok",
                "suggested_monthly_saving_amount": suggested.get(product.id),
            }
        )
        planned_by_type[product.product_type] += planned
        actual_by_type[product.product_type] += actual

    return {
        "year_month": year_month,
        "items": items,
        "savings": _plan_group(planned_by_type["savings"], actual_by_type["savings"], warn_pct, critical_pct),
        "investment": _plan_group(
            planned_by_type["investment"], actual_by_type["investment"], warn_pct, critical_pct
        ),
    }


def actuals_for_year(db: Session, year: int) -> dict[int, Decimal]:
    """해당 연도(1/1~12/31) 전체에 걸쳐 저축/투자 상품에 연결된 거래 합계.
    `actuals_for_month`와 동일한 매칭 규칙(Transaction.savings_product_id)을 연 단위로 적용한다."""
    start, end = year_bounds(year)
    rows = (
        db.query(Transaction.savings_product_id, func.sum(Transaction.amount))
        .filter(
            Transaction.savings_product_id.isnot(None),
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .group_by(Transaction.savings_product_id)
        .all()
    )
    return dict(rows)


def compute_annual_plan_summary(
    db: Session, year: int, as_of: date, warn_pct: float | None = None, critical_pct: float | None = None
) -> dict:
    """상품별 연간 누적 계획 대비 그 해 누적 실적(actuals_for_year)을 비교한다. 계획액은 달마다
    SavingsProductAnnualPlan(월별 그리드)에 값이 있으면 그 값을, 없으면 product.monthly_saving_amount로
    폴백해 12개월치를 합산한다(_monthly_targets_by_product_for_year). 월별 compute_plan_summary와
    달리 특정 달의 미달/초과가 다음 달로 이월되는 문제를 자연히 상쇄한다 — 한 달을 걸러도 이후 달에
    몰아 넣으면 누적 기준으로는 계획대로 납입한 것으로 인정된다."""
    elapsed_months = plan_targets.elapsed_months(year, as_of)
    products = plan_products(db)
    actuals = actuals_for_year(db, year)
    targets_by_product = _monthly_targets_by_product_for_year(db, [p.id for p in products], year)
    items = []
    annual_target_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    target_to_date_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    actual_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    for product in products:
        actual = actuals.get(product.id, Decimal("0"))
        product_targets = targets_by_product.get(product.id, {})
        monthly_amounts = [
            product_targets.get(year_month_of(year, month), product.monthly_saving_amount)
            for month in range(1, 13)
        ]
        annual_target = sum(monthly_amounts, Decimal("0"))
        target_to_date = sum(monthly_amounts[:elapsed_months], Decimal("0"))
        group = _plan_group(target_to_date, actual, warn_pct, critical_pct)
        items.append(
            {
                "id": product.id,
                "name": product.name,
                "product_type": product.product_type,
                "annual_target": annual_target,
                "target_to_date": group["planned"],
                "actual": group["actual"],
                "pct": group["pct"] if group["pct"] is not None else 0.0,
                "status": group["status"] if group["status"] is not None else "ok",
            }
        )
        annual_target_by_type[product.product_type] += annual_target
        target_to_date_by_type[product.product_type] += target_to_date
        actual_by_type[product.product_type] += actual

    def _group_out(product_type: str) -> dict:
        group = _plan_group(
            target_to_date_by_type[product_type], actual_by_type[product_type], warn_pct, critical_pct
        )
        annual_pct = pct_of(actual_by_type[product_type], annual_target_by_type[product_type], zero_planned_default=None)
        return {
            "annual_target": annual_target_by_type[product_type],
            "target_to_date": group["planned"],
            "actual": group["actual"],
            "pct": group["pct"],
            "annual_pct": annual_pct,
            "status": group["status"],
        }

    return {
        "year": year,
        "elapsed_months": elapsed_months,
        "items": items,
        "savings": _group_out("savings"),
        "investment": _group_out("investment"),
    }
