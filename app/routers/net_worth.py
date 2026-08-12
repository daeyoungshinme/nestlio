from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.net_worth import NetWorthGrowlioUnlinkedOut, NetWorthOut
from app.services import net_worth_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("", response_model=NetWorthOut)
def get_net_worth(
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
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
    try:
        return net_worth_service.compute_growlio_unlinked(db, bearer_token)
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
