from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.constants.benchmark_groups import BENCHMARK_GROUPS
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.reports import CategoryTrendOut, YearlyReportOut
from app.services import coaching_engine, coaching_settings_service, transaction_report_service
from app.utils.dates import year_bounds

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/yearly", response_model=YearlyReportOut)
def yearly(year: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    year = year or date.today().year
    monthly = transaction_report_service.yearly_monthly_breakdown(db, year)
    totals = transaction_report_service.yearly_totals(db, year)
    start, end = year_bounds(year)
    breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    thresholds = coaching_settings_service.get_thresholds(db)
    benchmark_pcts = {group: thresholds[f"benchmark_{group}_warn_pct"] for group in BENCHMARK_GROUPS if group != "other"}
    benchmark = coaching_engine.category_benchmark_rows(totals, breakdown, benchmark_pcts)
    return {
        "year": year,
        "prev_year": year - 1,
        "next_year": year + 1,
        "monthly": monthly,
        "totals": totals,
        "breakdown": breakdown,
        "benchmark": benchmark,
    }


@router.get("/category-trend", response_model=CategoryTrendOut)
def category_trend(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return transaction_report_service.category_monthly_trend(db, months=months)
