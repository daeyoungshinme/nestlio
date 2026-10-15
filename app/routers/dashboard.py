
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.common import YearMonth
from app.schemas.dashboard import DashboardBootstrapOut, DashboardOut, MonthlyRetrospectiveOut
from app.services import dashboard_service, net_worth_service
from app.utils.dates import now_kst, today_kst

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    year_month: YearMonth | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return dashboard_service.build(db, year_month=year_month, today=today_kst())


@router.get("/bootstrap", response_model=DashboardBootstrapOut)
def dashboard_bootstrap(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    user: User = Depends(get_current_user),
):
    """대시보드 첫 화면 묶음 조회(dashboard_service.bootstrap) — GET /net-worth와 같은 기회주의적 growlio 후크도 건다."""
    net_worth_service.schedule_background_refresh(background_tasks, bearer_token, user.id, now=now_kst())
    return dashboard_service.bootstrap(db, today_kst(), user.id)


@router.get("/monthly-retrospective", response_model=MonthlyRetrospectiveOut)
def monthly_retrospective(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """지난달(가장 최근 완결된 달) 요약 — 부부가 함께 돌아보는 월간 회고 카드용.
    월간 요약 이메일(notification_service.send_monthly_summary)과 dashboard_service.build_retrospective를 공유한다."""
    return dashboard_service.build_retrospective(db, today_kst())
