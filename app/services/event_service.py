import logging
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.notification_log import NotificationLog
from app.models.recurring_expense import RecurringExpense
from app.models.user import User
from app.services import gmail_service, notification_prefs_service
from app.services.google_auth import GoogleNotConnectedError, is_connected
from app.utils.dates import advance_due_date

logger = logging.getLogger("event_service")

_MAX_OCCURRENCE_STEPS = 2000
_SEOUL_TZ = ZoneInfo("Asia/Seoul")


class ImportedEventReadOnlyError(Exception):
    """Raised when an update/delete is attempted on a source='google_import' Event."""


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
        "source": event.source,
        "occurrence_start": occurrence_start if occurrence_start is not None else event.start_at,
    }


def list_events(db: Session, range_start: date, range_end: date) -> list[dict]:
    candidates = (
        db.query(Event)
        .filter(Event.start_at <= datetime.combine(range_end, datetime.max.time()))
        .filter(Event.dismissed_at.is_(None))
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
    if event.source == "google_import":
        raise ImportedEventReadOnlyError("Google 캘린더에서 가져온 일정은 nestlio에서 수정할 수 없습니다.")
    for key, value in fields.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    _sync_to_google(db, event)
    _notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 변경되었습니다")
    return event


def delete_event(db: Session, event_id: int, actor_id: uuid.UUID, now: datetime | None = None) -> bool:
    now = now or datetime.now()
    event = db.get(Event, event_id)
    if event is None:
        return False
    if event.source == "google_import":
        # 로컬 사본만 숨긴다 (User.removed_at과 동일한 소프트 삭제 패턴). 구글 캘린더의 원본 일정은
        # 사용자가 만든 것이 아니므로 google_calendar_service.delete_event를 호출해 실제로 지우지 않는다.
        event.dismissed_at = now
        db.commit()
        _notify_other_spouse(db, event, actor_id=actor_id, action_label="Google 캘린더 일정이 목록에서 숨겨졌습니다")
        return True
    _remove_from_google(event)
    _notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 삭제되었습니다")
    db.delete(event)
    db.commit()
    return True


def _parse_google_event(item: dict) -> dict | None:
    """Convert a raw Google Calendar event resource into Event-creation fields.
    Returns None for items missing a usable start time (defensive - Google always
    sends one for non-cancelled events, but guards against malformed payloads)."""
    start = item.get("start")
    end = item.get("end")
    if not start:
        return None

    if "date" in start:
        all_day = True
        start_at = datetime.combine(date.fromisoformat(start["date"]), datetime.min.time())
        end_at = None
        if end and "date" in end:
            # Google's all-day end date is exclusive (day after the last day) - invert that
            # to match how nestlio itself stores/exports all-day events (see _event_body_for_event).
            end_at = datetime.combine(date.fromisoformat(end["date"]) - timedelta(days=1), datetime.min.time())
    elif "dateTime" in start:
        all_day = False
        start_at = datetime.fromisoformat(start["dateTime"]).astimezone(_SEOUL_TZ).replace(tzinfo=None)
        end_at = None
        if end and "dateTime" in end:
            end_at = datetime.fromisoformat(end["dateTime"]).astimezone(_SEOUL_TZ).replace(tzinfo=None)
    else:
        return None

    return {
        "title": item.get("summary") or "(제목 없음)",
        "description": item.get("description"),
        "location": item.get("location"),
        "all_day": all_day,
        "start_at": start_at,
        "end_at": end_at,
        # Google already expands recurring events into individual instances for us
        # (singleEvents=True in google_calendar_service.list_events), so each imported
        # occurrence is stored as a flat one-off rather than re-deriving nestlio's own
        # weekly/monthly recurrence rule from Google's RRULE.
        "frequency": "once",
        "recurrence_end_date": None,
        "reminder_minutes_before": None,
    }


def import_from_google(db: Session, range_start: date, range_end: date, actor_id: uuid.UUID) -> dict:
    """Pull events from the connected Google Calendar for [range_start, range_end] and
    upsert them as read-only (source='google_import') Event rows. Idempotent: re-running
    for the same range updates existing imported rows in place instead of duplicating them.
    Rows the user has locally dismissed (dismissed_at set) are left untouched and counted
    as skipped rather than being resurrected."""
    if not is_connected():
        raise GoogleNotConnectedError("Google 계정이 연결되어 있지 않습니다.")

    from app.services import google_calendar_service  # lazy import: only needed when connected

    # Events nestlio itself already pushed to Google must not be reimported. nestlio has two
    # outbound paths: native Event rows (_sync_to_google -> Event.google_calendar_event_id) and
    # the scheduler's recurring-expense reminders (jobs.py::_sync_upcoming_calendar_events ->
    # RecurringExpense.calendar_event_id) - the latter includes recurring expenses linked to
    # 재무목표/재무설계 plan items, which would otherwise show up twice (once as the existing
    # "반복 내역 예정" card, once as a freshly imported event). Google expands recurring events
    # into instances whose id is "{masterId}_{RECURRENCEID}", while nestlio stores the *master*
    # id on both id columns above - so dedup on recurringEventId (falling back to id for
    # non-recurring events) rather than raw id.
    own_master_ids = {
        row[0]
        for row in db.query(Event.google_calendar_event_id)
        .filter(Event.google_calendar_event_id.isnot(None))
        .filter(Event.source == "native")
    }
    own_master_ids |= {
        row[0]
        for row in db.query(RecurringExpense.calendar_event_id)
        .filter(RecurringExpense.calendar_event_id.isnot(None))
    }

    created = updated = skipped = 0
    for item in google_calendar_service.list_events(range_start, range_end):
        if item.get("status") == "cancelled":
            continue
        master_id = item.get("recurringEventId") or item.get("id")
        if master_id in own_master_ids:
            continue

        parsed = _parse_google_event(item)
        if parsed is None:
            skipped += 1
            continue

        existing = (
            db.query(Event)
            .filter(Event.google_calendar_event_id == item["id"], Event.source == "google_import")
            .first()
        )
        if existing:
            if existing.dismissed_at is not None:
                skipped += 1
                continue
            for key, value in parsed.items():
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(
                Event(
                    **parsed,
                    google_calendar_event_id=item["id"],
                    source="google_import",
                    created_by=actor_id,
                )
            )
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


def send_due_reminders(db: Session, now: datetime, window_minutes: int = 15) -> int:
    """Send reminder emails for occurrences whose reminder time falls within
    [now, now + window_minutes). Meant to be called by a periodic scheduler job."""
    if not is_connected():
        return 0
    if not notification_prefs_service.is_enabled(db, "event_reminder"):
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
