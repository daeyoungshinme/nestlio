import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.models.savings_product import SavingsProduct


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


def deactivate_product(db: Session, product_id: int) -> bool:
    """대상이 있으면 비활성화하고 True, 없으면 False (라우터가 404로 변환)."""
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return False
    product.is_active = False
    product.growlio_account_id = None
    product.auto_sync_enabled = False
    product.last_synced_at = None
    db.commit()
    return True


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
