from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.budget import BudgetCopyIn, BudgetCopyResultOut, BudgetListOut, BudgetUpsertIn
from app.services import budget_service, coaching_settings_service
from app.utils.dates import shift_month, year_month_str

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _budget_list(db: Session, year_month: str | None) -> dict:
    ym = year_month or year_month_str(date.today())
    month_start = date.fromisoformat(ym + "-01")
    thresholds = coaching_settings_service.get_thresholds(db)
    rows = budget_service.budget_vs_actual(db, ym, thresholds["budget_warn_pct"], thresholds["budget_critical_pct"])
    return {
        "year_month": ym,
        "prev_month": year_month_str(shift_month(month_start, -1)),
        "next_month": year_month_str(shift_month(month_start, 1)),
        "rows": rows,
    }


@router.get("", response_model=BudgetListOut)
def list_budgets(
    year_month: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _budget_list(db, year_month)


@router.put("", response_model=BudgetListOut)
def upsert_budget(
    payload: BudgetUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget_service.upsert_budget(db, payload.category_id, payload.year_month, payload.amount, current_user.id)
    return _budget_list(db, payload.year_month)


@router.post("/copy-previous-month", response_model=BudgetCopyResultOut)
def copy_previous_month(
    payload: BudgetCopyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    copied = budget_service.copy_from_previous_month(db, payload.year_month, current_user.id)
    return {"copied": copied}
