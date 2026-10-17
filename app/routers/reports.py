import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import YearMonth
from app.schemas.reports import CategoryTrendOut, SavingsReviewOut, YearlyReportOut
from app.services import dashboard_service, transaction_trend_service
from app.utils.dates import today_kst

router = APIRouter(prefix="/reports", tags=["reports"])


# 가구 전체(생략·"all") / 공통 지출만("shared") / 배우자 UUID — 그 밖의 값은 FastAPI가 422로 막는다.
OwnerQuery = Annotated[uuid.UUID | Literal["all", "shared"] | None, Query()]


def _owner_filter(owner: uuid.UUID | Literal["all", "shared"] | None) -> uuid.UUID | Literal["shared"] | None:
    """category_breakdown_by_owner() 등이 받는 필터 값 — "all"은 None(가구 전체)과 같다."""
    return None if owner == "all" else owner


@router.get("/yearly", response_model=YearlyReportOut)
def yearly(
    year: int | None = None,
    owner: OwnerQuery = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.yearly_report(db, year or today_kst().year, _owner_filter(owner))


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
    owner: OwnerQuery = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.build_savings_review(db, year_month, _owner_filter(owner), today_kst())
