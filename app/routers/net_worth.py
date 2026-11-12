from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.net_worth import (
    GrowlioPushFailedOut,
    GrowlioPushRetryOut,
    NetWorthGrowlioUnlinkedOut,
    NetWorthOut,
)
from app.services import growlio_push_service, net_worth_service
from app.utils.dates import now_kst

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("", response_model=NetWorthOut)
def get_net_worth(
    background_tasks: BackgroundTasks,
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    user: User = Depends(get_current_user),
):
    # 대시보드·자산 화면이 공유하는 이 엔드포인트를 후크로 밀린 growlio 반영·오래된 잔액 새로고침을 응답 후에 돌린다.
    net_worth_service.schedule_background_refresh(background_tasks, bearer_token, user.id, now=now_kst())
    return net_worth_service.overview(db, months)


@router.get("/growlio-unlinked", response_model=NetWorthGrowlioUnlinkedOut)
def get_growlio_unlinked_net_worth(
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    """growlio에 있지만 아직 nestlio로 가져오지 않은 자산의 합계를 조회한다."""
    return net_worth_service.compute_growlio_unlinked(db, bearer_token)


@router.get("/growlio-pushes/failed", response_model=list[GrowlioPushFailedOut])
def list_failed_growlio_pushes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """growlio 반영을 자동으로 포기한 저축·투자 입출금(호출자·공동 소유) — 자산 화면 경고용."""
    return growlio_push_service.list_failed(db, user.id)


@router.post("/growlio-pushes/{push_id}/retry", response_model=GrowlioPushRetryOut)
def retry_growlio_push(
    push_id: int,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    user: User = Depends(get_current_user),
):
    return GrowlioPushRetryOut(sent=growlio_push_service.retry(db, push_id, user.id, bearer_token))
