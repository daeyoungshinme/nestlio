from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.cashflow_plan import (
    CashflowPlanCopyIn,
    CashflowPlanCopyResultOut,
    CashflowPlanItemSplitIn,
    CashflowPlanItemUpsertIn,
    CashflowPlanLinkRecurringIn,
    CashflowPlanListOut,
    CashflowPlanSplitResultOut,
)
from app.schemas.common import YearMonth
from app.services import cashflow_plan_service
from app.utils.dates import today_kst

router = APIRouter(prefix="/cashflow-plan", tags=["cashflow-plan"])


@router.get("", response_model=CashflowPlanListOut)
def list_plan(
    year_month: YearMonth | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return cashflow_plan_service.plan_view(db, year_month, today_kst())


@router.put("/items", response_model=CashflowPlanListOut)
def upsert_plan_item(
    payload: CashflowPlanItemUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = cashflow_plan_service.upsert_item(
        db,
        payload.id,
        payload.section,
        payload.owner_user_id,
        payload.name,
        payload.amount,
        payload.sort_order,
        payload.year_month,
        current_user.id,
        category_id=payload.category_id,
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="계획 항목을 찾을 수 없습니다.")
    return cashflow_plan_service.plan_view(db, payload.year_month, today_kst())


@router.post("/items/split", response_model=CashflowPlanSplitResultOut)
def split_plan_item(
    payload: CashflowPlanItemSplitIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    months = cashflow_plan_service.split_item_for_rest_of_year(
        db,
        payload.section,
        payload.owner_user_id,
        payload.name,
        payload.total_amount,
        payload.start_year_month,
        payload.sort_order,
        current_user.id,
        category_id=payload.category_id,
    )
    return {"created": months}


@router.post("/items/{item_id}/link-recurring", response_model=CashflowPlanListOut)
def link_recurring(
    item_id: int,
    payload: CashflowPlanLinkRecurringIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = cashflow_plan_service.link_recurring(db, item_id, payload.recurring_expense_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="계획 항목을 찾을 수 없습니다.")
    return cashflow_plan_service.plan_view(db, payload.year_month, today_kst())


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_item(
    item_id: int,
    year_month: YearMonth = Query(..., description="이 달의 금액만 지운다(다른 달 금액이 없으면 항목째 삭제)"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not cashflow_plan_service.delete_month(db, item_id, year_month):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="계획 항목을 찾을 수 없습니다.")


@router.post("/copy-previous-month", response_model=CashflowPlanCopyResultOut)
def copy_previous_month(
    payload: CashflowPlanCopyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    copied = cashflow_plan_service.copy_from_previous_month(db, payload.year_month, current_user.id)
    return {"copied": copied}
