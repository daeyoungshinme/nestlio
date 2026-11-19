import uuid
from decimal import Decimal

from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.models.loan import Loan
from app.models.savings_product import SavingsProduct
from app.services import growlio_client, user_service

# growlio_client로 옮김(계좌·대출 가져오기도 쓴다). 기존 import 경로 유지.
GrowlioAccountAlreadyLinkedError = growlio_client.GrowlioAccountAlreadyLinkedError


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


def create_product(
    db: Session,
    name: str,
    current_balance: Decimal,
    monthly_saving_amount: Decimal,
    product_type: str = "savings",
    principal_amount: Decimal | None = None,
    owner_user_id: uuid.UUID | None = None,
) -> SavingsProduct:
    user_service.validate_owner(db, owner_user_id)
    product = SavingsProduct(
        name=name,
        current_balance=current_balance,
        monthly_saving_amount=monthly_saving_amount,
        product_type=product_type,
        principal_amount=principal_amount,
        sort_order=DEFAULT_SORT_ORDER,
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
    current_balance: Decimal | None,
    monthly_saving_amount: Decimal,
    product_type: str,
    principal_amount: Decimal | None = None,
    owner_user_id: uuid.UUID | None = None,
) -> SavingsProduct | None:
    """`current_balance=None`이면 잔액은 그대로 — 수정 폼을 연 사이 배우자가 기록한 납입(adjust_balance)을
    폼의 옛 잔액으로 덮지 않게, 프론트는 잔액을 직접 바꿨을 때만 보낸다."""
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    user_service.validate_owner(db, owner_user_id, current=product.owner_user_id)
    product.name = name
    if current_balance is not None:
        product.current_balance = current_balance
    product.monthly_saving_amount = monthly_saving_amount
    product.product_type = product_type
    product.principal_amount = principal_amount
    product.owner_user_id = owner_user_id
    db.commit()
    db.refresh(product)
    return product


def deactivate_product(db: Session, product_id: int) -> bool:
    """대상이 있으면 비활성화하고 True, 없으면 False (라우터가 404로 변환)."""
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return False
    if product.product_type == "real_estate" and product.growlio_account_id:
        # 짝 담보대출(같은 growlio_account_id — real_estate_service.mortgage_loan_ids)도 함께 내린다. 아래에서 상품의
        # 연동을 지우면 짝을 찾을 수 없게 돼, 대출이 평범한 대출로 남아 순자산·"부동산 제외" 목표에서 계속 빠지고
        # 자금원 차단도 풀린다. 대출의 growlio_account_id는 남겨 다시 가져오면 같은 대출을 되살린다
        # (real_estate_service._upsert_linked_loan).
        db.query(Loan).filter(Loan.growlio_account_id == product.growlio_account_id, Loan.is_active.is_(True)).update(
            {Loan.is_active: False}, synchronize_session="fetch"
        )
    product.is_active = False
    product.growlio_account_id = None
    product.auto_sync_enabled = False
    product.last_synced_at = None
    db.commit()
    return True


def adjust_balance(db: Session, product_id: int, delta: Decimal) -> None:
    """커밋하지 않는다 — 호출부(transaction_service)가 거래 저장과 같은 커밋으로 묶는다.

    DB에서 `current_balance = current_balance + delta`로 더한다. 읽고-더하고-쓰면 두 사람이 같은 상품에 동시에 저축을
    넣거나 백그라운드 growlio 동기화와 겹칠 때 한쪽 변경이 사라진다(lost update)."""
    db.execute(
        update(SavingsProduct)
        .where(SavingsProduct.id == product_id)
        .values(current_balance=SavingsProduct.current_balance + delta)
        .execution_options(synchronize_session="fetch")
    )


def set_growlio_link(
    db: Session, product_id: int, growlio_account_id: str | None, auto_sync_enabled: bool
) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    if growlio_account_id and growlio_account_id != product.growlio_account_id:
        # 연동을 지운 비활성 상품은 growlio_account_id가 비어 있어 활성 상품만 보면 된다.
        if growlio_account_id in growlio_client.already_linked_growlio_ids(db, SavingsProduct):
            raise GrowlioAccountAlreadyLinkedError("이미 다른 저축·투자 상품에 연결된 growlio 계좌입니다.")
    product.growlio_account_id = growlio_account_id
    product.auto_sync_enabled = auto_sync_enabled if growlio_account_id else False
    if growlio_account_id is None:
        product.last_synced_at = None
    growlio_client.commit_growlio_links(db)
    db.refresh(product)
    return product
