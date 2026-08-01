from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.savings_product import SavingsProduct


def list_products(db: Session, active_only: bool = True) -> list[SavingsProduct]:
    query = db.query(SavingsProduct)
    if active_only:
        query = query.filter(SavingsProduct.is_active.is_(True))
    return query.order_by(SavingsProduct.sort_order, SavingsProduct.name).all()


def create_product(
    db: Session, name: str, current_balance: Decimal, monthly_saving_amount: Decimal
) -> SavingsProduct:
    product = SavingsProduct(
        name=name,
        current_balance=current_balance,
        monthly_saving_amount=monthly_saving_amount,
        sort_order=999,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(
    db: Session, product_id: int, name: str, current_balance: Decimal, monthly_saving_amount: Decimal
) -> SavingsProduct | None:
    product = db.get(SavingsProduct, product_id)
    if product is None:
        return None
    product.name = name
    product.current_balance = current_balance
    product.monthly_saving_amount = monthly_saving_amount
    db.commit()
    db.refresh(product)
    return product


def deactivate_product(db: Session, product_id: int) -> None:
    product = db.get(SavingsProduct, product_id)
    if product is not None:
        product.is_active = False
        db.commit()
