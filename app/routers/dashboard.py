from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardBootstrapOut, DashboardOut, MonthlyRetrospectiveOut
from app.services import (
    coaching_settings_service,
    couple_photo_service,
    dashboard_service,
    goal_service,
    net_worth_service,
    notification_settings_service,
    retrospective_service,
    savings_product_service,
    user_service,
)
from app.services.google_auth import is_connected
from app.utils.dates import now_kst, today_kst

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
        db, period=period, day=day, year_month=year_month, today=today_kst()
    )


@router.get("/bootstrap", response_model=DashboardBootstrapOut)
def dashboard_bootstrap(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    """대시보드 첫 화면에 필요한 settings/net-worth/financial-goals/savings-products/users를
    한 번에 조회한다 — 모바일 등 고지연 환경에서 대시보드 마운트 시 발생하는 병렬 요청 수를
    줄이기 위함. 각 리소스의 개별 엔드포인트(GET /settings 등)는 대시보드 밖 화면들이 계속
    쓰므로 그대로 둔다."""
    today = today_kst()
    # GET /net-worth와 동일한 기회주의적 growlio 갱신 후크(app/services/CLAUDE.md 참고).
    background_tasks.add_task(net_worth_service.refresh_stale_growlio_links, bearer_token, now=now_kst())
    return {
        "settings": {
            "google_connected": is_connected(),
            "notify_emails": notification_settings_service.get_recipients(db),
            "coaching_thresholds": coaching_settings_service.get_thresholds(db),
            "notification_prefs": notification_settings_service.get_prefs(db),
            "couple_photo_url": couple_photo_service.get_photo_url(),
        },
        "net_worth": {
            "current": net_worth_service.compute_current(db),
            "history": net_worth_service.list_history(db, 12),
        },
        "goals": [goal_service.to_out(db, goal, today) for goal in goal_service.list_goals(db)],
        "savings_products": savings_product_service.list_products(db),
        "users": user_service.list_users(db),
    }


@router.get("/monthly-retrospective", response_model=MonthlyRetrospectiveOut)
def monthly_retrospective(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """지난달(가장 최근 완결된 달) 요약 — 부부가 함께 돌아보는 월간 회고 카드용.
    월간 요약 이메일(notification_service.send_monthly_summary)과 retrospective_service를 공유한다."""
    return retrospective_service.build(db, today_kst())
