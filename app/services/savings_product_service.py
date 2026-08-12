from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.savings_product import SavingsProduct
from app.models.transaction import Transaction
from app.services import growlio_client
from app.utils.dates import month_bounds, parse_year_month, year_bounds

PLAN_PRODUCT_TYPES = ("savings", "investment")


class GrowlioSyncError(Exception):
    """동기화 요청이 사용자에게 보여줄 수 있는 사유로 실패했을 때 (연동 없음/계좌 못 찾음)."""


def _map_product_type(asset_type: str) -> str:
    return "investment" if asset_type in growlio_client.INVESTMENT_ASSET_TYPES else "savings"


def list_products(db: Session, active_only: bool = True) -> list[SavingsProduct]:
    query = db.query(SavingsProduct)
    if active_only:
        query = query.filter(SavingsProduct.is_active.is_(True))
    return query.order_by(SavingsProduct.sort_order, SavingsProduct.name).all()


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


def _plan_status(pct: float) -> str:
    """저축/투자 계획 달성률은 미달(실적이 계획에 못 미침)이 위험이므로 income 섹션과 같은 방향으로 판단한다
    (cashflow_plan_service._status 참고) — 새 임계값을 추가하지 않고 기존 예산 경고/위험 기준을 재사용한다."""
    effective_pct = 100 - pct
    if effective_pct >= settings.budget_critical_pct:
        return "critical"
    if effective_pct >= settings.budget_warn_pct:
        return "warn"
    return "ok"


def _plan_group(planned: Decimal, actual: Decimal) -> dict:
    pct = float(actual / planned * 100) if planned else (100.0 if actual else None)
    return {
        "planned": planned,
        "actual": actual,
        "pct": min(pct, 999) if pct is not None else None,
        "status": _plan_status(pct) if pct is not None else None,
    }


def compute_plan_summary(db: Session, year_month: str) -> dict:
    """저축/투자(부동산 제외) 상품별 이번 달 계획(monthly_saving_amount) 대비 실적(actuals_for_month)을
    계산한다. 이 함수 자체는 읽기 전용 집계만 담당하고, 상품 추가/수정은 update_product 등 별도 함수가 맡는다."""
    products = [p for p in list_products(db) if p.product_type in PLAN_PRODUCT_TYPES]
    actuals = actuals_for_month(db, year_month)
    items = []
    planned_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    actual_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    for product in products:
        actual = actuals.get(product.id, Decimal("0"))
        group = _plan_group(product.monthly_saving_amount, actual)
        items.append(
            {
                "id": product.id,
                "name": product.name,
                "product_type": product.product_type,
                "planned": group["planned"],
                "actual": group["actual"],
                "pct": group["pct"] if group["pct"] is not None else 0.0,
                "status": group["status"] if group["status"] is not None else "ok",
            }
        )
        planned_by_type[product.product_type] += product.monthly_saving_amount
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


def _elapsed_months(year: int, as_of: date) -> int:
    if year < as_of.year:
        return 12
    if year > as_of.year:
        return 0
    return as_of.month


def compute_annual_plan_summary(db: Session, year: int, as_of: date) -> dict:
    """상품별 연간 누적 계획(monthly_saving_amount * 연초부터 as_of까지 경과 개월수) 대비
    그 해 누적 실적(actuals_for_year)을 비교한다. 월별 compute_plan_summary와 달리 특정 달의
    미달/초과가 다음 달로 이월되는 문제를 자연히 상쇄한다 — 한 달을 걸러도 이후 달에 몰아 넣으면
    누적 기준으로는 계획대로 납입한 것으로 인정된다."""
    elapsed_months = _elapsed_months(year, as_of)
    products = [p for p in list_products(db) if p.product_type in PLAN_PRODUCT_TYPES]
    actuals = actuals_for_year(db, year)
    items = []
    annual_target_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    target_to_date_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    actual_by_type: dict[str, Decimal] = {t: Decimal("0") for t in PLAN_PRODUCT_TYPES}
    for product in products:
        actual = actuals.get(product.id, Decimal("0"))
        annual_target = product.monthly_saving_amount * 12
        target_to_date = product.monthly_saving_amount * elapsed_months
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
) -> SavingsProduct:
    product = SavingsProduct(
        name=name,
        current_balance=current_balance,
        monthly_saving_amount=monthly_saving_amount,
        product_type=product_type,
        principal_amount=principal_amount,
        sort_order=999,
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
) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    product.name = name
    product.current_balance = current_balance
    product.monthly_saving_amount = monthly_saving_amount
    product.product_type = product_type
    product.principal_amount = principal_amount
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
    match = next((a for a in accounts if a["id"] == product.growlio_account_id), None)
    if match is None:
        raise GrowlioSyncError("growlio에서 연동된 계좌를 찾을 수 없습니다. 계좌가 삭제되었을 수 있습니다.")
    product.current_balance = Decimal(str(match["current_value_krw"]))
    product.last_synced_at = now
    db.commit()
    db.refresh(product)
    return product


def import_from_growlio(
    db: Session, growlio_account_ids: list[str], bearer_token: str, *, now: datetime
) -> list[SavingsProduct]:
    """선택한 growlio 계좌들을 각각 새 저축/투자 상품으로 일괄 생성하고 연동한다."""
    if not growlio_account_ids:
        return []
    accounts_by_id = {
        a["id"]: a
        for a in growlio_client.fetch_account_balances(bearer_token)
        if _is_importable_asset_type(a["asset_type"])
    }
    already_linked = {
        product_id
        for (product_id,) in db.query(SavingsProduct.growlio_account_id).filter(
            SavingsProduct.growlio_account_id.isnot(None), SavingsProduct.is_active.is_(True)
        )
    }
    created: list[SavingsProduct] = []
    for account_id in growlio_account_ids:
        if account_id in already_linked:
            continue
        account = accounts_by_id.get(account_id)
        if account is None:
            continue
        product = SavingsProduct(
            name=account["name"],
            current_balance=Decimal(str(account["current_value_krw"])),
            monthly_saving_amount=Decimal("0"),
            product_type=_map_product_type(account["asset_type"]),
            growlio_account_id=account_id,
            auto_sync_enabled=True,
            last_synced_at=now,
            sort_order=999,
        )
        db.add(product)
        created.append(product)
    db.commit()
    for product in created:
        db.refresh(product)
    return created
