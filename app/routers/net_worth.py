from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.net_worth import NetWorthGrowlioUnlinkedOut, NetWorthOut
from app.services import net_worth_service

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("", response_model=NetWorthOut)
def get_net_worth(
    background_tasks: BackgroundTasks,
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    # 대시보드·자산 화면이 공유하는 이 엔드포인트를 후크로, auto_sync_enabled인데 오래된 growlio
    # 연동 잔액을 응답 후 백그라운드로 조용히 새로고침한다(스케줄러엔 사용자 JWT가 없어서).
    background_tasks.add_task(
        net_worth_service.refresh_stale_growlio_links, bearer_token, now=datetime.now()
    )
    return {
        "current": net_worth_service.compute_current(db),
        "history": net_worth_service.list_history(db, months),
    }


@router.get("/growlio-unlinked", response_model=NetWorthGrowlioUnlinkedOut)
def get_growlio_unlinked_net_worth(
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    """growlio에 있지만 아직 nestlio로 가져오지 않은 자산의 합계를 조회한다."""
    return net_worth_service.compute_growlio_unlinked(db, bearer_token)
