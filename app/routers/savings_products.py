from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.savings_product import (
    GrowlioAccountOut,
    SavingsProductAnnualPlanDetailOut,
    SavingsProductAnnualPlanListOut,
    SavingsProductAnnualPlanUpsertIn,
    SavingsProductCreateIn,
    SavingsProductGrowlioImportIn,
    SavingsProductGrowlioLinkIn,
    SavingsProductOut,
    SavingsProductPlanListOut,
    SavingsProductSyncAllOut,
    SavingsProductUpdateIn,
)
from app.services import coaching_settings_service, savings_product_service
from app.utils.dates import year_month_str

router = APIRouter(prefix="/savings-products", tags=["savings-products"])


@router.get("", response_model=list[SavingsProductOut])
def list_products(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return savings_product_service.list_products(db)


@router.get("/plan", response_model=SavingsProductPlanListOut)
def get_plan_summary(
    year_month: str | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    ym = year_month or year_month_str(date.today())
    thresholds = coaching_settings_service.get_thresholds(db)
    return savings_product_service.compute_plan_summary(
        db, ym, thresholds["budget_warn_pct"], thresholds["budget_critical_pct"]
    )


@router.get("/annual-plan", response_model=SavingsProductAnnualPlanListOut)
def get_annual_plan_summary(year: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today()
    thresholds = coaching_settings_service.get_thresholds(db)
    return savings_product_service.compute_annual_plan_summary(
        db, year or today.year, as_of=today,
        warn_pct=thresholds["budget_warn_pct"], critical_pct=thresholds["budget_critical_pct"],
    )


@router.get("/{product_id}/annual-plan/{year}", response_model=SavingsProductAnnualPlanDetailOut)
def get_product_annual_plan(
    product_id: int, year: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    plan = savings_product_service.get_annual_plan(db, product_id, year)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return plan


@router.put("/{product_id}/annual-plan", response_model=SavingsProductAnnualPlanDetailOut)
def upsert_product_annual_plan(
    product_id: int,
    payload: SavingsProductAnnualPlanUpsertIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    plan = savings_product_service.upsert_annual_plan(
        db,
        product_id,
        payload.year,
        payload.start_month,
        payload.end_month,
        [t.model_dump() for t in payload.monthly_targets],
    )
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return savings_product_service.get_annual_plan(db, product_id, payload.year)


@router.get("/growlio-accounts", response_model=list[GrowlioAccountOut])
def list_growlio_accounts(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """저축상품 연동 대상 선택을 위해 growlio 계좌 목록을 프록시로 조회한다."""
    return savings_product_service.list_growlio_accounts(bearer_token)


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
        payload.owner_user_id,
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
        payload.owner_user_id,
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
    product = savings_product_service.sync_from_growlio(db, product_id, bearer_token, now=datetime.now())
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저축/투자 상품을 찾을 수 없습니다.")
    return product


@router.post("/sync-all", response_model=SavingsProductSyncAllOut)
def sync_all_products(
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    synced_count, failed = savings_product_service.sync_all_from_growlio(db, bearer_token, now=datetime.now())
    return SavingsProductSyncAllOut(synced_count=synced_count, failed=failed)


@router.post("/growlio-import", response_model=list[SavingsProductOut])
def import_growlio_accounts(
    payload: SavingsProductGrowlioImportIn,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    current_user: User = Depends(get_current_user),
):
    """선택한 growlio 계좌들을 각각 새 저축/투자 상품으로 일괄 가져온다 ('전체 선택' 가져오기)."""
    return savings_product_service.import_from_growlio(
        db, payload.growlio_account_ids, bearer_token, current_user.id, now=datetime.now()
    )


@router.post("/{product_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    savings_product_service.deactivate_product(db, product_id)
