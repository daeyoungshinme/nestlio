from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.budget import BudgetListOut
from app.services import budget_service, coaching_settings_service
from app.utils.dates import shift_month, year_month_str

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=BudgetListOut)
def list_budgets(
    year_month: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
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
