from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.real_estate import (
    GrowlioRealEstateOut,
    RealEstateGrowlioImportIn,
    RealEstateImportResultOut,
)
from app.services import real_estate_service

router = APIRouter(prefix="/real-estate", tags=["real-estate"])


@router.get("/growlio-accounts", response_model=list[GrowlioRealEstateOut])
def list_growlio_real_estate(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """부동산 연동 대상 선택을 위해 growlio 부동산 계좌 목록을 프록시로 조회한다."""
    return real_estate_service.list_growlio_real_estate(bearer_token)


@router.post("/growlio-import", response_model=list[RealEstateImportResultOut])
def import_growlio_real_estate(
    payload: RealEstateGrowlioImportIn,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    current_user: User = Depends(get_current_user),
):
    """선택한 growlio 부동산 계좌들을 자산 항목(+담보대출)으로 일괄 가져온다."""
    pairs = real_estate_service.import_from_growlio(
        db, payload.growlio_account_ids, bearer_token, current_user.id, now=datetime.now()
    )
    return [RealEstateImportResultOut(savings_product=product, loan=loan) for product, loan in pairs]


@router.post("/{savings_product_id}/sync", response_model=RealEstateImportResultOut)
def sync_real_estate(
    savings_product_id: int,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    result = real_estate_service.sync_from_growlio(db, savings_product_id, bearer_token, now=datetime.now())
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "부동산 상품을 찾을 수 없습니다.")
    product, loan = result
    return RealEstateImportResultOut(savings_product=product, loan=loan)
