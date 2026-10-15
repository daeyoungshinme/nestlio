import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import YearMonth
from app.schemas.reports import CategoryTrendOut, SavingsReviewOut, YearlyReportOut
from app.services import dashboard_service, transaction_trend_service
from app.utils.dates import today_kst

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
    return dashboard_service.yearly_report(db, year or today_kst().year, _parse_owner_filter(owner))


@router.get("/category-trend", response_model=CategoryTrendOut)
def category_trend(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return transaction_trend_service.category_monthly_trend(db, months=months)


@router.get("/savings-review", response_model=SavingsReviewOut)
def savings_review(
    year_month: YearMonth | None = None,
    owner: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.build_savings_review(db, year_month, _parse_owner_filter(owner), today_kst())
