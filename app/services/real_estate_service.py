from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.loan import Loan
from app.models.savings_product import SavingsProduct
from app.services import growlio_client
from app.services.savings_product_service import GrowlioSyncError

__all__ = ["GrowlioSyncError", "list_growlio_real_estate", "import_from_growlio", "sync_from_growlio"]


def list_growlio_real_estate(bearer_token: str) -> list[dict]:
    """연동 대상 선택 UI를 위해 growlio 부동산 계좌 목록을 전달한다."""
    return growlio_client.fetch_real_estate_items(bearer_token)


def _upsert_linked_loan(
    db: Session, *, growlio_account_id: str, name: str, mortgage_balance_krw: float, now: datetime
) -> Loan | None:
    """growlio_account_id로 짝이 되는 대출을 찾아 잔액을 갱신하거나, 없으면(첫 가져오기이고
    담보대출이 있는 경우) 새로 만든다. 담보대출이 0원이면 새로 만들지 않는다."""
    loan = db.query(Loan).filter(Loan.growlio_account_id == growlio_account_id).one_or_none()
    if loan is None:
        if mortgage_balance_krw <= 0:
            return None
        loan = Loan(
            name=f"{name} 담보대출",
            balance=Decimal(str(mortgage_balance_krw)),
            monthly_payment=Decimal("0"),
            growlio_account_id=growlio_account_id,
            auto_sync_enabled=True,
            last_synced_at=now,
            sort_order=999,
        )
        db.add(loan)
    else:
        loan.balance = Decimal(str(mortgage_balance_krw))
        loan.last_synced_at = now
    return loan


def import_from_growlio(
    db: Session, growlio_account_ids: list[str], bearer_token: str, *, now: datetime
) -> list[tuple[SavingsProduct, Loan | None]]:
    """선택한 growlio 부동산 계좌들을 각각 새 저축/투자 상품(product_type=real_estate)으로
    가져오고, 담보대출이 있으면 짝이 되는 대출도 함께 만든다."""
    if not growlio_account_ids:
        return []
    items_by_id = {item["id"]: item for item in growlio_client.fetch_real_estate_items(bearer_token)}
    already_linked = {
        product_id
        for (product_id,) in db.query(SavingsProduct.growlio_account_id).filter(
            SavingsProduct.growlio_account_id.isnot(None), SavingsProduct.is_active.is_(True)
        )
    }
    created: list[tuple[SavingsProduct, Loan | None]] = []
    for account_id in growlio_account_ids:
        if account_id in already_linked:
            continue
        item = items_by_id.get(account_id)
        if item is None:
            continue
        product = SavingsProduct(
            name=item["name"],
            current_balance=Decimal(str(item["market_value_krw"])),
            monthly_saving_amount=Decimal("0"),
            product_type="real_estate",
            principal_amount=Decimal(str(item["purchase_price_krw"])) if item.get("purchase_price_krw") else None,
            growlio_account_id=account_id,
            auto_sync_enabled=True,
            last_synced_at=now,
            sort_order=999,
        )
        db.add(product)
        loan = _upsert_linked_loan(
            db,
            growlio_account_id=account_id,
            name=item["name"],
            mortgage_balance_krw=item.get("mortgage_balance_krw") or 0,
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
    match = next((item for item in items if item["id"] == product.growlio_account_id), None)
    if match is None:
        raise GrowlioSyncError("growlio에서 연동된 부동산 계좌를 찾을 수 없습니다. 계좌가 삭제되었을 수 있습니다.")

    product.current_balance = Decimal(str(match["market_value_krw"]))
    if match.get("purchase_price_krw"):
        product.principal_amount = Decimal(str(match["purchase_price_krw"]))
    product.last_synced_at = now

    loan = db.query(Loan).filter(Loan.growlio_account_id == product.growlio_account_id).one_or_none()
    mortgage_balance_krw = match.get("mortgage_balance_krw") or 0
    if loan is not None:
        loan.balance = Decimal(str(mortgage_balance_krw))
        loan.last_synced_at = now

    db.commit()
    db.refresh(product)
    if loan is not None:
        db.refresh(loan)
    return product, loan
