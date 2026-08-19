from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.notification import MarkAllReadOut, NotificationListOut, NotificationReactionIn
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = notification_service.list_notifications(db, current_user.id, limit=limit)
    unread = notification_service.unread_count(db, current_user.id)
    return {"items": items, "unread_count": unread}


@router.post("/{notification_log_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        notification_service.mark_read(db, current_user.id, notification_log_id)
    except notification_service.NotificationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None


@router.post("/read-all", response_model=MarkAllReadOut)
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    marked = notification_service.mark_all_read(db, current_user.id)
    return {"marked": marked}


@router.put("/{notification_log_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
def react(
    notification_log_id: int,
    payload: NotificationReactionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        notification_service.add_reaction(db, current_user.id, notification_log_id, payload.emoji, payload.message)
    except notification_service.NotificationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    except notification_service.InvalidReactionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


@router.delete("/{notification_log_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
def unreact(
    notification_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification_service.remove_reaction(db, current_user.id, notification_log_id)
