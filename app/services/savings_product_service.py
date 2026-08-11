from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.savings_product import SavingsProduct
from app.services import growlio_client


class GrowlioSyncError(Exception):
    """동기화 요청이 사용자에게 보여줄 수 있는 사유로 실패했을 때 (연동 없음/계좌 못 찾음)."""


def _map_product_type(asset_type: str) -> str:
    return "investment" if asset_type in growlio_client.INVESTMENT_ASSET_TYPES else "savings"


def list_products(db: Session, active_only: bool = True) -> list[SavingsProduct]:
    query = db.query(SavingsProduct)
    if active_only:
        query = query.filter(SavingsProduct.is_active.is_(True))
    return query.order_by(SavingsProduct.sort_order, SavingsProduct.name).all()


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
