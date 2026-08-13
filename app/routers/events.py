from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.event import EventCreateIn, EventImportResultOut, EventListOut, EventOut, EventUpdateIn
from app.services import event_service, recurring_service
from app.services.event_service import ImportedEventReadOnlyError
from app.services.google_auth import GoogleNotConnectedError
from app.utils.dates import month_bounds

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/import-google", response_model=EventImportResultOut)
def import_google_events(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    try:
        return event_service.import_from_google(db, df, dt, current_user.id)
    except GoogleNotConnectedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=EventListOut)
def list_events(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    return {
        "items": event_service.list_events(db, df, dt),
        "recurring_due": recurring_service.due_in_range(db, df, dt),
    }


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
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
    )
    return event_service.to_out_dict(event)


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    payload: EventUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        event = event_service.update_event(
            db,
            event_id,
            actor_id=current_user.id,
            title=payload.title,
            description=payload.description,
            location=payload.location,
            all_day=payload.all_day,
            start_at=payload.start_at,
            end_at=payload.end_at,
            frequency=payload.frequency,
            recurrence_end_date=payload.recurrence_end_date,
            reminder_minutes_before=payload.reminder_minutes_before,
        )
    except ImportedEventReadOnlyError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event_service.to_out_dict(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = event_service.delete_event(db, event_id, actor_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
