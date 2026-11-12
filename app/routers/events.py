from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.event import (
    EventCompleteIn,
    EventCreateIn,
    EventListOut,
    EventOut,
    EventUpdateIn,
)
from app.services import event_reminder_service, event_service
from app.utils.dates import today_kst

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=EventListOut)
def list_events(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return event_service.list_view(db, date_from, date_to, today_kst())


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    background_tasks: BackgroundTasks,
    payload: EventCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = event_service.create_event(
        db,
        created_by=current_user.id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        all_day=payload.all_day,
        start_at=payload.start_at,
        end_at=payload.end_at,
        frequency=payload.frequency,
        recurrence_end_date=payload.recurrence_end_date,
        reminder_minutes_before=payload.reminder_minutes_before,
        assignee_id=payload.assignee_id,
    )
    event_reminder_service.notify_other_spouse_best_effort(
        db, event, current_user.id, "새 일정이 등록되었습니다", background_tasks=background_tasks
    )
    return event_service.to_out_dict(event)


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    background_tasks: BackgroundTasks,
    event_id: int,
    payload: EventUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = event_service.update_event(
        db,
        event_id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        all_day=payload.all_day,
        start_at=payload.start_at,
        end_at=payload.end_at,
        frequency=payload.frequency,
        recurrence_end_date=payload.recurrence_end_date,
        reminder_minutes_before=payload.reminder_minutes_before,
        assignee_id=payload.assignee_id,
    )
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="일정을 찾을 수 없습니다.")
    event_reminder_service.notify_other_spouse_best_effort(
        db, event, current_user.id, "일정이 변경되었습니다", background_tasks=background_tasks
    )
    return event_service.to_out_dict(event)


@router.patch("/{event_id}/complete", response_model=EventOut)
def complete_event(
    event_id: int,
    payload: EventCompleteIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = event_service.set_completed(
        db, event_id, completed=payload.completed, occurrence_date=payload.occurrence_date
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="일정을 찾을 수 없습니다.")
    return result


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    background_tasks: BackgroundTasks,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = event_service.delete_event(db, event_id)
    if deleted is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="일정을 찾을 수 없습니다.")
    event_reminder_service.notify_other_spouse_best_effort(
        db, deleted, current_user.id, "일정이 삭제되었습니다", background_tasks=background_tasks
    )
