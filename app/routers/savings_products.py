from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.savings_product import SavingsProductCreateIn, SavingsProductOut, SavingsProductUpdateIn
from app.services import savings_product_service

router = APIRouter(prefix="/savings-products", tags=["savings-products"])


@router.get("", response_model=list[SavingsProductOut])
def list_products(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return savings_product_service.list_products(db)


@router.post("", response_model=SavingsProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: SavingsProductCreateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return savings_product_service.create_product(
        db, payload.name, payload.current_balance, payload.monthly_saving_amount
    )


@router.put("/{product_id}", response_model=SavingsProductOut)
def update_product(
    product_id: int,
    payload: SavingsProductUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = savings_product_service.update_product(
        db, product_id, payload.name, payload.current_balance, payload.monthly_saving_amount
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return product


@router.post("/{product_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    savings_product_service.deactivate_product(db, product_id)
