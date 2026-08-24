import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.reports import CategoryTrendOut, YearlyReportOut
from app.services import coaching_engine, coaching_settings_service, transaction_report_service
from app.utils.dates import year_bounds

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_owner_filter(owner: str | None) -> uuid.UUID | Literal["shared"] | None:
    """owner 쿼리 파라미터를 category_breakdown_by_owner()가 받는 필터 값으로 변환한다.
    None/"all" = 가구 전체, "shared" = 공통 지출만, 그 외는 배우자 UUID."""
    if owner is None or owner == "all":
        return None
    if owner == "shared":
        return "shared"
    try:
        return uuid.UUID(owner)
    except ValueError:
        raise HTTPException(status_code=422, detail="owner 파라미터가 올바르지 않습니다.") from None


@router.get("/yearly", response_model=YearlyReportOut)
def yearly(
    year: int | None = None,
    owner: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    year = year or date.today().year
    monthly = transaction_report_service.yearly_monthly_breakdown(db, year)
    # totals(소득 등)는 owner 필터와 무관하게 항상 가구 전체 기준으로 유지한다 — benchmark 비교가
    # "가구 소득 대비 이 배우자의 지출 비중"을 뜻하도록 하기 위함("이 배우자 개인 소득 대비"가 아님).
    totals = transaction_report_service.yearly_totals(db, year)
    start, end = year_bounds(year)
    owner_filter = _parse_owner_filter(owner)
    breakdown = transaction_report_service.category_breakdown_by_owner(db, start, end, "expense", owner_filter)
    thresholds = coaching_settings_service.get_thresholds(db)
    benchmark_pcts = coaching_engine.benchmark_pcts_from_thresholds(thresholds)
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
