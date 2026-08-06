from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.savings_product import (
    GrowlioAccountOut,
    SavingsProductCreateIn,
    SavingsProductGrowlioImportIn,
    SavingsProductGrowlioLinkIn,
    SavingsProductOut,
    SavingsProductUpdateIn,
)
from app.services import savings_product_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError

router = APIRouter(prefix="/savings-products", tags=["savings-products"])


@router.get("", response_model=list[SavingsProductOut])
def list_products(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return savings_product_service.list_products(db)


@router.get("/growlio-accounts", response_model=list[GrowlioAccountOut])
def list_growlio_accounts(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """저축상품 연동 대상 선택을 위해 growlio 계좌 목록을 프록시로 조회한다."""
    try:
        return savings_product_service.list_growlio_accounts(bearer_token)
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.post("", response_model=SavingsProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: SavingsProductCreateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return savings_product_service.create_product(
        db,
        payload.name,
        payload.current_balance,
        payload.monthly_saving_amount,
        payload.product_type,
        payload.principal_amount,
    )


@router.put("/{product_id}", response_model=SavingsProductOut)
def update_product(
    product_id: int,
    payload: SavingsProductUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = savings_product_service.update_product(
        db,
        product_id,
        payload.name,
        payload.current_balance,
        payload.monthly_saving_amount,
        payload.product_type,
        payload.principal_amount,
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return product


@router.put("/{product_id}/growlio-link", response_model=SavingsProductOut)
def set_growlio_link(
    product_id: int,
    payload: SavingsProductGrowlioLinkIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = savings_product_service.set_growlio_link(
        db, product_id, payload.growlio_account_id, payload.auto_sync_enabled
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return product


@router.post("/{product_id}/sync", response_model=SavingsProductOut)
def sync_product(
    product_id: int,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    try:
        product = savings_product_service.sync_from_growlio(db, product_id, bearer_token, now=datetime.now())
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except savings_product_service.GrowlioSyncError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return product


@router.post("/growlio-import", response_model=list[SavingsProductOut])
def import_growlio_accounts(
    payload: SavingsProductGrowlioImportIn,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    """선택한 growlio 계좌들을 각각 새 저축/투자 상품으로 일괄 가져온다 ('전체 선택' 가져오기)."""
    try:
        return savings_product_service.import_from_growlio(
            db, payload.growlio_account_ids, bearer_token, now=datetime.now()
        )
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.post("/{product_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    savings_product_service.deactivate_product(db, product_id)
