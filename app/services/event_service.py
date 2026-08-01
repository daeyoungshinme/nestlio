import logging
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.services import gmail_service
from app.services.google_auth import GoogleNotConnectedError, is_connected
from app.utils.dates import advance_due_date

logger = logging.getLogger("event_service")

_MAX_OCCURRENCE_STEPS = 2000


def _occurrences_in_range(event: Event, range_start: date, range_end: date) -> list[datetime]:
    """Expand a (possibly recurring) event into its occurrence datetimes within [range_start, range_end]."""
    if event.frequency == "once":
        d = event.start_at.date()
        return [event.start_at] if range_start <= d <= range_end else []

    limit = min(event.recurrence_end_date, range_end) if event.recurrence_end_date else range_end
    day_of_month = event.start_at.day
    time_of_day = event.start_at.time()

    occurrences: list[datetime] = []
    current = event.start_at.date()
    guard = 0
    while current <= limit and guard < _MAX_OCCURRENCE_STEPS:
        if current >= range_start:
            occurrences.append(datetime.combine(current, time_of_day))
        current = advance_due_date(current, event.frequency, day_of_month)
        guard += 1
    return occurrences


def to_out_dict(event: Event, occurrence_start: datetime | None = None) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "all_day": event.all_day,
        "start_at": event.start_at,
        "end_at": event.end_at,
        "frequency": event.frequency,
        "recurrence_end_date": event.recurrence_end_date,
        "reminder_minutes_before": event.reminder_minutes_before,
        "creator": event.creator,
        "occurrence_start": occurrence_start if occurrence_start is not None else event.start_at,
    }


def list_events(db: Session, range_start: date, range_end: date) -> list[dict]:
    candidates = (
        db.query(Event)
        .filter(Event.start_at <= datetime.combine(range_end, datetime.max.time()))
        .filter(
            (Event.frequency == "once")
            | (Event.recurrence_end_date.is_(None))
            | (Event.recurrence_end_date >= range_start)
        )
        .all()
    )
    results: list[dict] = []
    for event in candidates:
        for occurrence_start in _occurrences_in_range(event, range_start, range_end):
            results.append(to_out_dict(event, occurrence_start))
    results.sort(key=lambda r: r["occurrence_start"])
    return results


def get_event(db: Session, event_id: int) -> Event | None:
    return db.get(Event, event_id)


def create_event(
    db: Session,
    created_by: uuid.UUID,
    title: str,
    start_at: datetime,
    description: str | None = None,
    location: str | None = None,
    all_day: bool = False,
    end_at: datetime | None = None,
    frequency: str = "once",
    recurrence_end_date: date | None = None,
    reminder_minutes_before: int | None = None,
) -> Event:
    event = Event(
        title=title,
        description=description,
        location=location,
        all_day=all_day,
        start_at=start_at,
        end_at=end_at,
        frequency=frequency,
        recurrence_end_date=recurrence_end_date,
        reminder_minutes_before=reminder_minutes_before,
        created_by=created_by,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    _sync_to_google(db, event)
    _notify_other_spouse(db, event, actor_id=created_by, action_label="새 일정이 등록되었습니다")
    return event


def update_event(db: Session, event_id: int, actor_id: uuid.UUID, **fields) -> Event | None:
    event = db.get(Event, event_id)
    if event is None:
        return None
    for key, value in fields.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    _sync_to_google(db, event)
    _notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 변경되었습니다")
    return event


def delete_event(db: Session, event_id: int, actor_id: uuid.UUID) -> bool:
    event = db.get(Event, event_id)
    if event is None:
        return False
    _remove_from_google(event)
    _notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 삭제되었습니다")
    db.delete(event)
    db.commit()
    return True


def send_due_reminders(db: Session, now: datetime, window_minutes: int = 15) -> int:
    """Send reminder emails for occurrences whose reminder time falls within
    [now, now + window_minutes). Meant to be called by a periodic scheduler job."""
    if not is_connected():
        return 0

    sent = 0
    candidates = db.query(Event).filter(Event.reminder_minutes_before.isnot(None)).all()
    for event in candidates:
        for occurrence in _due_occurrences(event, now, window_minutes):
            if _already_notified(db, event.id, occurrence):
                continue
            _send_reminder_email(event, occurrence)
            _log_notified(db, event.id, occurrence)
            sent += 1
    return sent


def _due_occurrences(event: Event, now: datetime, window_minutes: int) -> list[datetime]:
    lead = timedelta(minutes=event.reminder_minutes_before)
    range_start = now.date()
    range_end = (now + lead + timedelta(days=1)).date()
    due = []
    for occurrence in _occurrences_in_range(event, range_start, range_end):
        reminder_at = occurrence - lead
        if now <= reminder_at < now + timedelta(minutes=window_minutes):
            due.append(occurrence)
    return due


def _already_notified(db: Session, event_id: int, occurrence: datetime) -> bool:
    return (
        db.query(NotificationLog)
        .filter(
            NotificationLog.notif_type == "event_reminder",
            NotificationLog.related_id == event_id,
            NotificationLog.year_month == occurrence.isoformat(),
        )
        .first()
        is not None
    )


def _log_notified(db: Session, event_id: int, occurrence: datetime) -> None:
    db.add(
        NotificationLog(
            notif_type="event_reminder",
            related_type="event",
            related_id=event_id,
            year_month=occurrence.isoformat(),
            status="sent",
        )
    )
    db.commit()


def _send_reminder_email(event: Event, occurrence: datetime) -> None:
    body = _event_summary_text(event, occurrence)
    try:
        gmail_service.send_email(f"[Nestlio] 일정 리마인더: {event.title}", body)
    except Exception:
        logger.exception("일정 리마인더 이메일 발송 실패: %s", event.title)


def _notify_other_spouse(db: Session, event: Event, actor_id: uuid.UUID, action_label: str) -> None:
    if not is_connected():
        return
    recipients = db.query(User).filter(User.id != actor_id).all()
    if not recipients:
        return
    to = ", ".join(u.email for u in recipients)
    body = _event_summary_text(event, event.start_at, header=action_label)
    try:
        gmail_service.send_email(f"[Nestlio] {action_label}: {event.title}", body, to=to)
    except Exception:
        logger.exception("일정 알림 이메일 발송 실패: %s", event.title)


def _event_summary_text(event: Event, when: datetime, header: str | None = None) -> str:
    lines = [header] if header else []
    lines.append(event.title)
    lines.append(f"일시: {when.strftime('%Y-%m-%d %H:%M')}")
    if event.location:
        lines.append(f"장소: {event.location}")
    if event.description:
        lines.append("")
        lines.append(event.description)
    return "\n".join(lines)


def _sync_to_google(db: Session, event: Event) -> None:
    if not is_connected():
        return
    from app.services import google_calendar_service  # lazy import: only needed when connected

    try:
        google_calendar_service.upsert_event(db, event)
    except GoogleNotConnectedError:
        pass
    except Exception:
        logger.exception("캘린더 이벤트 동기화 실패: %s", event.title)


def _remove_from_google(event: Event) -> None:
    if not is_connected():
        return
    from app.services import google_calendar_service  # lazy import: only needed when connected

    try:
        google_calendar_service.delete_event(event)
    except GoogleNotConnectedError:
        pass
    except Exception:
        logger.exception("캘린더 이벤트 삭제 실패: %s", event.title)
