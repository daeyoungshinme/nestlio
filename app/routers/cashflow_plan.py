from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
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
from app.services import cashflow_plan_service
from app.utils.dates import months_remaining_in_year, parse_year_month, shift_month, year_month_str

router = APIRouter(prefix="/cashflow-plan", tags=["cashflow-plan"])


def _plan_list(db: Session, year_month: str | None) -> dict:
    ym = year_month or year_month_str(date.today())
    month_start = parse_year_month(ym)
    items = cashflow_plan_service.list_items(db, ym)
    actuals = cashflow_plan_service.actuals_for_month(db, ym)
    return {
        "year_month": ym,
        "prev_month": year_month_str(shift_month(month_start, -1)),
        "next_month": year_month_str(shift_month(month_start, 1)),
        "items": items,
        "summary": cashflow_plan_service.compute_summary(items, actuals),
    }


@router.get("", response_model=CashflowPlanListOut)
def list_plan(
    year_month: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _plan_list(db, year_month)


@router.put("/items", response_model=CashflowPlanListOut)
def upsert_plan_item(
    payload: CashflowPlanItemUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cashflow_plan_service.upsert_item(
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
    return _plan_list(db, payload.year_month)


@router.post("/items/split", response_model=CashflowPlanSplitResultOut)
def split_plan_item(
    payload: CashflowPlanItemSplitIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    months = months_remaining_in_year(parse_year_month(payload.start_year_month))
    created = cashflow_plan_service.split_item_into_months(
        db,
        payload.section,
        payload.owner_user_id,
        payload.name,
        payload.total_amount,
        payload.start_year_month,
        months,
        payload.sort_order,
        current_user.id,
        category_id=payload.category_id,
    )
    return {"created": len(created)}


@router.post("/items/{item_id}/link-recurring", response_model=CashflowPlanListOut)
def link_recurring(
    item_id: int,
    payload: CashflowPlanLinkRecurringIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        item = cashflow_plan_service.link_recurring(db, item_id, payload.recurring_expense_id)
    except cashflow_plan_service.RecurringExpenseNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="계획 항목을 찾을 수 없습니다.")
    return _plan_list(db, item.year_month)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cashflow_plan_service.delete_item(db, item_id)


@router.post("/copy-previous-month", response_model=CashflowPlanCopyResultOut)
def copy_previous_month(
    payload: CashflowPlanCopyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    copied = cashflow_plan_service.copy_from_previous_month(db, payload.year_month, current_user.id)
    return {"copied": copied}
