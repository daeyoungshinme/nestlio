from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.annual_plan import AnnualPlanItemUpsertIn, AnnualPlanListOut, AnnualPlanSeedIn
from app.services import annual_plan_service, coaching_settings_service
from app.utils.dates import today_kst

router = APIRouter(prefix="/annual-plan", tags=["annual-plan"])


def _plan_list(db: Session, year: int, today: date) -> dict:
    items = annual_plan_service.list_items(db, year)
    warn_pct, critical_pct = coaching_settings_service.budget_thresholds(db)
    return {
        "year": year,
        "items": [annual_plan_service.item_to_out(item) for item in items],
        "summary": annual_plan_service.summary_for_year(db, year, today, warn_pct, critical_pct),
        "category_budgets": annual_plan_service.category_budget_vs_actual(db, year, warn_pct, critical_pct),
    }


@router.get("", response_model=AnnualPlanListOut)
def get_plan(year: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _plan_list(db, year, today_kst())


@router.put("/items", response_model=AnnualPlanListOut)
def upsert_plan_item(
    payload: AnnualPlanItemUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = annual_plan_service.upsert_item(
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
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "연간계획 항목을 찾을 수 없습니다.")
    return _plan_list(db, payload.year, today_kst())


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not annual_plan_service.delete_item(db, item_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "연간계획 항목을 찾을 수 없습니다.")


@router.post("/seed", response_model=AnnualPlanListOut)
def seed_plan(
    payload: AnnualPlanSeedIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """빈 해의 연간계획을 작년 계획/반복거래/최근 3개월 평균 중 하나로 한 번에 채운다(이미 있으면 409)."""
    today = today_kst()
    try:
        annual_plan_service.seed_year(db, payload.year, payload.source, current_user.id, today)
    except annual_plan_service.PlanAlreadyExistsError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return _plan_list(db, payload.year, today)
