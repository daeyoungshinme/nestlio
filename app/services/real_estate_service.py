import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.loan import Loan
from app.models.savings_product import SavingsProduct
from app.services import growlio_client
from app.services.growlio_client import GrowlioSyncError

__all__ = [
    "GrowlioSyncError",
    "list_growlio_real_estate",
    "import_from_growlio",
    "sync_from_growlio",
    "sync_all_from_growlio",
]


def list_growlio_real_estate(bearer_token: str) -> list[dict]:
    """연동 대상 선택 UI를 위해 growlio 부동산 계좌 목록을 전달한다."""
    return growlio_client.fetch_real_estate_items(bearer_token)


def _update_linked_loan_balance(db: Session, growlio_account_id: str, mortgage_balance_krw, now: datetime) -> Loan | None:
    """이미 연동된 담보대출이 있으면 잔액/동기화시각만 갱신한다(없으면 새로 만들지 않는다).
    동기화 경로(sync_from_growlio / sync_all_from_growlio)는 "가져온 적 없는 대출을 새로 만들지
    않는다"는 규칙이라 이 update-only 헬퍼를 공유한다. mortgage_balance_krw는 growlio 응답의
    raw 값(growlio는 내부적으로 float)이라 여기서 Decimal로 감싸지 않고 넘겨받는다."""
    loan = db.query(Loan).filter(Loan.growlio_account_id == growlio_account_id).one_or_none()
    if loan is not None:
        loan.balance = growlio_client.to_decimal_krw(mortgage_balance_krw)
        loan.last_synced_at = now
    return loan


def _upsert_linked_loan(
    db: Session,
    *,
    growlio_account_id: str,
    name: str,
    mortgage_balance_krw,
    owner_user_id: uuid.UUID,
    now: datetime,
) -> Loan | None:
    """가져오기(import) 전용 — 짝이 되는 대출을 갱신하거나, 없으면 새로 만든다. 담보대출이
    0원이면 새로 만들지 않는다. 이미 연동된 대출을 갱신할 땐 소유자를 건드리지 않는다."""
    loan = _update_linked_loan_balance(db, growlio_account_id, mortgage_balance_krw, now)
    if loan is not None:
        return loan
    if mortgage_balance_krw <= 0:
        return None
    loan = Loan(
        name=f"{name} 담보대출",
        balance=growlio_client.to_decimal_krw(mortgage_balance_krw),
        monthly_payment=Decimal("0"),
        growlio_account_id=growlio_account_id,
        auto_sync_enabled=True,
        last_synced_at=now,
        sort_order=999,
        owner_user_id=owner_user_id,
    )
    db.add(loan)
    return loan


def import_from_growlio(
    db: Session, growlio_account_ids: list[str], bearer_token: str, owner_user_id: uuid.UUID, *, now: datetime
) -> list[tuple[SavingsProduct, Loan | None]]:
    """선택한 growlio 부동산 계좌들을 각각 새 저축/투자 상품(product_type=real_estate)으로
    가져오고, 담보대출이 있으면 짝이 되는 대출도 함께 만든다.

    owner_user_id는 가져오기를 실행한 사용자(bearer_token의 주인)로, growlio 자체가 그 사람의
    Supabase JWT 기준으로 스코프된 계좌만 돌려주므로 이 사람이 곧 실제 소유자다.
    """
    if not growlio_account_ids:
        return []
    items_by_id = {item["id"]: item for item in growlio_client.fetch_real_estate_items(bearer_token)}
    already_linked = growlio_client.already_linked_growlio_ids(db, SavingsProduct)
    created: list[tuple[SavingsProduct, Loan | None]] = []
    for account_id in growlio_account_ids:
        if account_id in already_linked:
            continue
        item = items_by_id.get(account_id)
        if item is None:
            continue
        product = SavingsProduct(
            name=item["name"],
            current_balance=growlio_client.to_decimal_krw(item["market_value_krw"]),
            monthly_saving_amount=Decimal("0"),
            product_type="real_estate",
            principal_amount=growlio_client.to_decimal_krw(item["purchase_price_krw"])
            if item.get("purchase_price_krw")
            else None,
            growlio_account_id=account_id,
            auto_sync_enabled=True,
            last_synced_at=now,
            sort_order=999,
            owner_user_id=owner_user_id,
        )
        db.add(product)
        loan = _upsert_linked_loan(
            db,
            growlio_account_id=account_id,
            name=item["name"],
            mortgage_balance_krw=item.get("mortgage_balance_krw") or 0,
            owner_user_id=owner_user_id,
            now=now,
        )
        created.append((product, loan))
    db.commit()
    for product, loan in created:
        db.refresh(product)
        if loan is not None:
            db.refresh(loan)
    return created


def sync_from_growlio(
    db: Session, savings_product_id: int, bearer_token: str, *, now: datetime
) -> tuple[SavingsProduct, Loan | None] | None:
    """부동산 자산 상품과 짝이 되는 대출을 growlio 최신 값으로 함께 동기화한다."""
    product = db.get(SavingsProduct, savings_product_id)
    if product is None:
        return None
    if not product.growlio_account_id:
        raise GrowlioSyncError("연동된 growlio 계좌가 없습니다.")
    items = growlio_client.fetch_real_estate_items(bearer_token)
    match = growlio_client.find_by_growlio_id(items, product.growlio_account_id)
    if match is None:
        raise GrowlioSyncError("growlio에서 연동된 부동산 계좌를 찾을 수 없습니다. 계좌가 삭제되었을 수 있습니다.")

    product.current_balance = growlio_client.to_decimal_krw(match["market_value_krw"])
    if match.get("purchase_price_krw"):
        product.principal_amount = growlio_client.to_decimal_krw(match["purchase_price_krw"])
    product.last_synced_at = now

    loan = _update_linked_loan_balance(db, product.growlio_account_id, match.get("mortgage_balance_krw") or 0, now)

    db.commit()
    db.refresh(product)
    if loan is not None:
        db.refresh(loan)
    return product, loan


def sync_all_from_growlio(db: Session, bearer_token: str, *, now: datetime) -> tuple[int, list[dict]]:
    """연동된 부동산 자산을 모두 한 번에 짝이 되는 대출과 함께 동기화한다 (자산현황 "전체 동기화").

    growlio 목록은 1회만 조회해 여러 상품에 매칭한다. 배우자 소유 등으로 매칭이 안 되는 상품은
    예외를 던지지 않고 failed 목록에 담아 나머지 동기화를 계속 진행한다.
    """
    linked_products = (
        db.query(SavingsProduct)
        .filter(
            SavingsProduct.product_type == "real_estate",
            SavingsProduct.growlio_account_id.isnot(None),
            SavingsProduct.is_active.is_(True),
        )
        .all()
    )
    if not linked_products:
        return 0, []
    items = growlio_client.fetch_real_estate_items(bearer_token)
    synced_count = 0
    failed: list[dict] = []
    for product in linked_products:
        match = growlio_client.find_by_growlio_id(items, product.growlio_account_id)
        if match is None:
            failed.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "reason": "growlio에서 연동된 부동산 계좌를 찾을 수 없습니다 (배우자 계정이거나 삭제되었을 수 있습니다).",
                }
            )
            continue
        product.current_balance = growlio_client.to_decimal_krw(match["market_value_krw"])
        if match.get("purchase_price_krw"):
            product.principal_amount = growlio_client.to_decimal_krw(match["purchase_price_krw"])
        product.last_synced_at = now

        _update_linked_loan_balance(db, product.growlio_account_id, match.get("mortgage_balance_krw") or 0, now)
        synced_count += 1
    db.commit()
    return synced_count, failed
