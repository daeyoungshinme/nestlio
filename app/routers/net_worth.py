from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.net_worth import NetWorthOut
from app.services import net_worth_service

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
