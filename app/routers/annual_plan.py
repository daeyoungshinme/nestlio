from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.annual_plan import AnnualPlanItemUpsertIn, AnnualPlanListOut
from app.services import annual_plan_service, coaching_settings_service

router = APIRouter(prefix="/annual-plan", tags=["annual-plan"])


def _plan_list(db: Session, year: int, today: date) -> dict:
    items = annual_plan_service.list_items(db, year)
    thresholds = coaching_settings_service.get_thresholds(db)
    warn_pct, critical_pct = thresholds["budget_warn_pct"], thresholds["budget_critical_pct"]
    return {
        "year": year,
        "items": [annual_plan_service.item_to_out(item) for item in items],
        "summary": annual_plan_service.summary_for_year(db, year, today, warn_pct, critical_pct),
        "category_budgets": annual_plan_service.category_budget_vs_actual(db, year, warn_pct, critical_pct),
    }


@router.get("", response_model=AnnualPlanListOut)
def get_plan(year: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _plan_list(db, year, date.today())


@router.put("/items", response_model=AnnualPlanListOut)
def upsert_plan_item(
    payload: AnnualPlanItemUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    annual_plan_service.upsert_item(
        db,
        payload.id,
        payload.year,
        payload.section,
        payload.owner_user_id,
        payload.name,
        payload.category_id,
        payload.sort_order,
        current_user.id,
        payload.start_month,
        payload.end_month,
        monthly_targets=[mt.model_dump() for mt in payload.monthly_targets],
    )
    return _plan_list(db, payload.year, date.today())


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not annual_plan_service.delete_item(db, item_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "연간계획 항목을 찾을 수 없습니다.")
