import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.savings_product import SavingsProduct
from app.models.savings_product_annual_plan import SavingsProductAnnualPlan
from app.models.savings_product_annual_plan_monthly_target import SavingsProductAnnualPlanMonthlyTarget
from app.models.transaction import Transaction
from app.services import growlio_client
from app.services.growlio_client import GrowlioSyncError
from app.utils.dates import month_bounds, parse_year_month, shift_month, year_bounds, year_month_str
from app.utils.plan_status import pct_of, status_from_pct

PLAN_PRODUCT_TYPES = ("savings", "investment")


def _map_product_type(asset_type: str) -> str:
    return "investment" if asset_type in growlio_client.INVESTMENT_ASSET_TYPES else "savings"


def list_products(db: Session, active_only: bool = True) -> list[SavingsProduct]:
    query = db.query(SavingsProduct)
    if active_only:
        query = query.filter(SavingsProduct.is_active.is_(True))
    return query.order_by(SavingsProduct.sort_order, SavingsProduct.name).all()


def get_emergency_fund_balance(db: Session) -> Decimal | None:
    """활성 비상금 상품(product_type='emergency_fund')들의 잔액 합. 등록된 상품이 없으면
    coaching_engine이 "설정 없음"으로 처리할 수 있도록 None을 반환한다."""
    total = (
        db.query(func.sum(SavingsProduct.current_balance))
        .filter(SavingsProduct.product_type == "emergency_fund", SavingsProduct.is_active.is_(True))
        .scalar()
    )
    return total


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
    return {product_id: amount for product_id, amount in rows}


def trailing_average_actuals(db: Session, year_month: str, months: int = 3) -> dict[int, Decimal]:
    """`year_month` 직전 `months`개월 동안 상품별 실제 납입액 평균 — 부진한 상품의 다음 달 계획
    제안값으로 쓰인다."""
    month_start = parse_year_month(year_month)
    totals: dict[int, Decimal] = {}
    for offset in range(1, months + 1):
        for product_id, amount in actuals_for_month(db, year_month_str(shift_month(month_start, -offset))).items():
            totals[product_id] = totals.get(product_id, Decimal("0")) + amount
    return {product_id: total / months for product_id, total in totals.items()}


def _apply_monthly_targets(plan: SavingsProductAnnualPlan, monthly_targets: list[dict] | None) -> None:
    """year_month로 기존 행을 매칭해 target_amount만 갱신하고, 새 월은 새로 만든다 —
    annual_plan_service._apply_monthly_targets와 동일 패턴. 빠진 월은 목록에서 제외돼 delete-orphan으로
    삭제된다."""
    existing_by_month = {mt.year_month: mt for mt in plan.monthly_targets}
    new_targets: list[SavingsProductAnnualPlanMonthlyTarget] = []
    for entry in monthly_targets or []:
        year_month = entry["year_month"]
        existing = existing_by_month.get(year_month)
        if existing is not None:
            existing.target_amount = entry["target_amount"]
            new_targets.append(existing)
        else:
            new_targets.append(
                SavingsProductAnnualPlanMonthlyTarget(year_month=year_month, target_amount=entry["target_amount"])
            )
    plan.monthly_targets = new_targets


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
        "start_month": f"{year}-01",
        "end_month": f"{year}-12",
        "monthly_targets": [
            {"year_month": f"{year}-{month:02d}", "target_amount": product.monthly_saving_amount}
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
    _apply_monthly_targets(plan, monthly_targets)
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


def _plan_status(pct: float) -> str:
    """저축/투자 계획 달성률은 미달(실적이 계획에 못 미침)이 위험이므로 income 섹션과 같은 방향으로 판단한다
    (utils/plan_status.status_from_pct의 invert 옵션) — 새 임계값을 추가하지 않고 기존 예산 경고/위험 기준을 재사용한다."""
    return status_from_pct(pct, settings.budget_warn_pct, settings.budget_critical_pct, invert=True)


def _plan_group(planned: Decimal, actual: Decimal) -> dict:
    pct = pct_of(actual, planned, zero_planned_default=None)
    return {
        "planned": planned,
        "actual": actual,
        "pct": pct,
        "status": _plan_status(pct) if pct is not None else None,
    }


def compute_plan_summary(db: Session, year_month: str) -> dict:
    """저축/투자(부동산 제외) 상품별 이번 달 계획 대비 실적(actuals_for_month)을 계산한다. 계획액은
    그 달이 속한 연도에 SavingsProductAnnualPlan(월별 그리드)이 설정돼 있으면 그 값을, 없으면
    product.monthly_saving_amount로 폴백한다(_monthly_targets_by_product_for_year). 이 함수 자체는
    읽기 전용 집계만 담당하고, 상품 추가/수정은 update_product 등 별도 함수가 맡는다."""
    products = [p for p in list_products(db) if p.product_type in PLAN_PRODUCT_TYPES]
    year = int(year_month[:4])
    targets_by_product = _monthly_targets_by_product_for_year(db, [p.id for p in products], year)
    actuals = actuals_for_month(db, year_month)
    suggested = trailing_average_actuals(db, year_month, months=3)
    items = []
    planned_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    actual_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    for product in products:
        planned = targets_by_product.get(product.id, {}).get(year_month, product.monthly_saving_amount)
        actual = actuals.get(product.id, Decimal("0"))
        group = _plan_group(planned, actual)
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
        "savings": _plan_group(planned_by_type["savings"], actual_by_type["savings"]),
        "investment": _plan_group(planned_by_type["investment"], actual_by_type["investment"]),
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
    return {product_id: amount for product_id, amount in rows}


def yearly_monthly_actuals(db: Session, year: int) -> list[Decimal]:
    """저축/투자 상품에 연결된 거래의 월별 합계(1~12월, 상품 구분 없이 전체 합산) —
    actuals_for_year와 동일한 매칭 규칙(Transaction.savings_product_id)을 월 단위로 적용한다.
    app/services/annual_plan_service.py의 저축투자 축 월별 실적에 쓰인다."""
    start, end = year_bounds(year)
    rows = (
        db.query(Transaction.transaction_date, Transaction.amount)
        .filter(
            Transaction.savings_product_id.isnot(None),
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .all()
    )
    totals = {month: Decimal("0") for month in range(1, 13)}
    for tx_date, amount in rows:
        totals[tx_date.month] += amount or Decimal("0")
    return [totals[month] for month in range(1, 13)]


def _elapsed_months(year: int, as_of: date) -> int:
    if year < as_of.year:
        return 12
    if year > as_of.year:
        return 0
    return as_of.month


def compute_annual_plan_summary(db: Session, year: int, as_of: date) -> dict:
    """상품별 연간 누적 계획 대비 그 해 누적 실적(actuals_for_year)을 비교한다. 계획액은 달마다
    SavingsProductAnnualPlan(월별 그리드)에 값이 있으면 그 값을, 없으면 product.monthly_saving_amount로
    폴백해 12개월치를 합산한다(_monthly_targets_by_product_for_year). 월별 compute_plan_summary와
    달리 특정 달의 미달/초과가 다음 달로 이월되는 문제를 자연히 상쇄한다 — 한 달을 걸러도 이후 달에
    몰아 넣으면 누적 기준으로는 계획대로 납입한 것으로 인정된다."""
    elapsed_months = _elapsed_months(year, as_of)
    products = [p for p in list_products(db) if p.product_type in PLAN_PRODUCT_TYPES]
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
            product_targets.get(f"{year}-{month:02d}", product.monthly_saving_amount) for month in range(1, 13)
        ]
        annual_target = sum(monthly_amounts, Decimal("0"))
        target_to_date = sum(monthly_amounts[:elapsed_months], Decimal("0"))
        group = _plan_group(target_to_date, actual)
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
        group = _plan_group(target_to_date_by_type[product_type], actual_by_type[product_type])
        return {
            "annual_target": annual_target_by_type[product_type],
            "target_to_date": group["planned"],
            "actual": group["actual"],
            "pct": group["pct"],
            "status": group["status"],
        }

    return {
        "year": year,
        "elapsed_months": elapsed_months,
        "items": items,
        "savings": _group_out("savings"),
        "investment": _group_out("investment"),
    }


def create_product(
    db: Session,
    name: str,
    current_balance: Decimal,
    monthly_saving_amount: Decimal,
    product_type: str = "savings",
    principal_amount: Decimal | None = None,
    owner_user_id: uuid.UUID | None = None,
) -> SavingsProduct:
    product = SavingsProduct(
        name=name,
        current_balance=current_balance,
        monthly_saving_amount=monthly_saving_amount,
        product_type=product_type,
        principal_amount=principal_amount,
        sort_order=999,
        owner_user_id=owner_user_id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(
    db: Session,
    product_id: int,
    name: str,
    current_balance: Decimal,
    monthly_saving_amount: Decimal,
    product_type: str,
    principal_amount: Decimal | None = None,
    owner_user_id: uuid.UUID | None = None,
) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    product.name = name
    product.current_balance = current_balance
    # 연동된 목표가 상품을 1개만 쓸 때는 월 계획액이 그 목표의 monthly_saving_amount로만 갱신된다
    # (app/services/goal_service.py::_sync_funding_product_monthly_amount) — 프론트에서 이미
    # 입력 자체를 막지만, 여기서도 들어온 값을 무시해 방어한다.
    if not product.monthly_saving_amount_synced:
        product.monthly_saving_amount = monthly_saving_amount
    product.product_type = product_type
    product.principal_amount = principal_amount
    product.owner_user_id = owner_user_id
    db.commit()
    db.refresh(product)
    return product


def deactivate_product(db: Session, product_id: int) -> None:
    product = db.get(SavingsProduct, product_id)
    if product is not None:
        product.is_active = False
        product.growlio_account_id = None
        product.auto_sync_enabled = False
        product.last_synced_at = None
        db.commit()


def adjust_balance(db: Session, product_id: int, delta: Decimal) -> None:
    product = db.get(SavingsProduct, product_id)
    if product is not None:
        product.current_balance += delta
        db.commit()


def set_growlio_link(
    db: Session, product_id: int, growlio_account_id: str | None, auto_sync_enabled: bool
) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    product.growlio_account_id = growlio_account_id
    product.auto_sync_enabled = auto_sync_enabled if growlio_account_id else False
    if growlio_account_id is None:
        product.last_synced_at = None
    db.commit()
    db.refresh(product)
    return product


def _is_importable_asset_type(asset_type: str) -> bool:
    """은행 계좌(계좌 탭에서 별도로 가져옴)와 부동산(시세/담보대출 페어로 다뤄야 해서
    real_estate_service의 전용 플로우로만 가져옴)은 이 일반 가져오기 대상에서 제외한다."""
    return asset_type not in growlio_client.BANK_ASSET_TYPES and asset_type != growlio_client.REAL_ESTATE_ASSET_TYPE


def list_growlio_accounts(bearer_token: str) -> list[dict]:
    """연동 대상 선택 UI를 위해 growlio 계좌 목록을 전달한다."""
    accounts = growlio_client.fetch_account_balances(bearer_token)
    return [a for a in accounts if _is_importable_asset_type(a["asset_type"])]


def sync_from_growlio(db: Session, product_id: int, bearer_token: str, *, now: datetime) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    if not product.growlio_account_id:
        raise GrowlioSyncError("연동된 growlio 계좌가 없습니다.")
    accounts = growlio_client.fetch_account_balances(bearer_token)
    match = growlio_client.find_by_growlio_id(accounts, product.growlio_account_id)
    if match is None:
        raise GrowlioSyncError("growlio에서 연동된 계좌를 찾을 수 없습니다. 계좌가 삭제되었을 수 있습니다.")
    product.current_balance = growlio_client.to_decimal_krw(match["current_value_krw"])
    product.last_synced_at = now
    db.commit()
    db.refresh(product)
    return product


def sync_all_from_growlio(db: Session, bearer_token: str, *, now: datetime) -> tuple[int, list[dict]]:
    """연동된 저축/투자 상품을 모두 한 번에 동기화한다 (자산현황 "전체 동기화").

    부동산(product_type="real_estate")은 짝이 되는 대출까지 다뤄야 해서 별도 growlio 엔드포인트
    (fetch_real_estate_items)를 쓰는 real_estate_service.sync_all_from_growlio의 몫이라 제외한다.
    growlio 목록은 1회만 조회해 여러 상품에 매칭하며, 배우자 소유 등으로 매칭이 안 되는 상품은
    예외를 던지지 않고 failed 목록에 담아 나머지 동기화를 계속 진행한다.
    """
    linked_products = [
        p for p in list_products(db) if p.growlio_account_id and p.product_type != "real_estate"
    ]
    if not linked_products:
        return 0, []
    growlio_accounts = growlio_client.fetch_account_balances(bearer_token)
    synced_count = 0
    failed: list[dict] = []
    for product in linked_products:
        match = growlio_client.find_by_growlio_id(growlio_accounts, product.growlio_account_id)
        if match is None:
            failed.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "reason": "growlio에서 연동된 계좌를 찾을 수 없습니다 (배우자 계정이거나 삭제되었을 수 있습니다).",
                }
            )
            continue
        product.current_balance = growlio_client.to_decimal_krw(match["current_value_krw"])
        product.last_synced_at = now
        synced_count += 1
    db.commit()
    return synced_count, failed


def import_from_growlio(
    db: Session, growlio_account_ids: list[str], bearer_token: str, owner_user_id: uuid.UUID, *, now: datetime
) -> list[SavingsProduct]:
    """선택한 growlio 계좌들을 각각 새 저축/투자 상품으로 일괄 생성하고 연동한다.

    owner_user_id는 가져오기를 실행한 사용자(bearer_token의 주인)로, growlio 자체가 그 사람의
    Supabase JWT 기준으로 스코프된 계좌만 돌려주므로 이 사람이 곧 실제 소유자다.
    """
    if not growlio_account_ids:
        return []
    accounts_by_id = {
        a["id"]: a
        for a in growlio_client.fetch_account_balances(bearer_token)
        if _is_importable_asset_type(a["asset_type"])
    }
    already_linked = growlio_client.already_linked_growlio_ids(db, SavingsProduct)
    created: list[SavingsProduct] = []
    for account_id in growlio_account_ids:
        if account_id in already_linked:
            continue
        account = accounts_by_id.get(account_id)
        if account is None:
            continue
        product = SavingsProduct(
            name=account["name"],
            current_balance=growlio_client.to_decimal_krw(account["current_value_krw"]),
            monthly_saving_amount=Decimal("0"),
            product_type=_map_product_type(account["asset_type"]),
            growlio_account_id=account_id,
            auto_sync_enabled=True,
            last_synced_at=now,
            sort_order=999,
            owner_user_id=owner_user_id,
        )
        db.add(product)
        created.append(product)
    db.commit()
    for product in created:
        db.refresh(product)
    return created
