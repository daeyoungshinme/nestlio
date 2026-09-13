import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.models.savings_product import SavingsProduct
from app.services import growlio_client, savings_product_service
from app.services.growlio_client import GrowlioSyncError


def _map_product_type(asset_type: str) -> str:
    return "investment" if asset_type in growlio_client.INVESTMENT_ASSET_TYPES else "savings"


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
        p
        for p in savings_product_service.list_products(db)
        if p.growlio_account_id and p.product_type != "real_estate"
    ]
    if not linked_products:
        return 0, []
    growlio_accounts = growlio_client.fetch_account_balances(bearer_token)

    def _apply(product: SavingsProduct, match: dict) -> None:
        product.current_balance = growlio_client.to_decimal_krw(match["current_value_krw"])

    synced_count, failed = growlio_client.sync_linked_rows(
        linked_products, growlio_accounts, now=now, apply=_apply
    )
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
            sort_order=DEFAULT_SORT_ORDER,
            owner_user_id=owner_user_id,
        )
        db.add(product)
        created.append(product)
    db.commit()
    for product in created:
        db.refresh(product)
    return created
