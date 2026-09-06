from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardOut, MonthlyRetrospectiveOut
from app.services import dashboard_service, retrospective_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    period: Literal["today", "week", "month"] = "month",
    day: str | None = Query(None, alias="date"),
    year_month: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.build(
        db, period=period, day=day, year_month=year_month, today=date.today()
    )


@router.get("/monthly-retrospective", response_model=MonthlyRetrospectiveOut)
def monthly_retrospective(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """지난달(가장 최근 완결된 달) 요약 — 부부가 함께 돌아보는 월간 회고 카드용.
    월간 요약 이메일(notification_service.send_monthly_summary)과 retrospective_service를 공유한다."""
    return retrospective_service.build(db, date.today())
