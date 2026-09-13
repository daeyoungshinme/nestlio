import logging
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.recurring_expense import RecurringExpense
from app.services.google_auth import GoogleNotConnectedError, is_connected
from app.utils.dates import to_kst_naive

logger = logging.getLogger(__name__)


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
        start_at = to_kst_naive(datetime.fromisoformat(start["dateTime"]))
        end_at = None
        if end and "dateTime" in end:
            end_at = to_kst_naive(datetime.fromisoformat(end["dateTime"]))
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
    # outbound paths: native Event rows (sync_to_google -> Event.google_calendar_event_id) and
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

        try:
            parsed = _parse_google_event(item)
        except Exception:
            # 구글 일정 하나가 예상 밖 포맷(예: 특이한 dateTime)이어도 그 달 전체 import를
            # 중단시키지 않는다 - 해당 건만 건너뛰고 나머지는 계속 가져온다.
            logger.warning("구글 일정 파싱 실패, 건너뜀 (id=%s)", item.get("id"), exc_info=True)
            skipped += 1
            continue
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


def sync_to_google(db: Session, event: Event) -> None:
    if not is_connected():
        return
    from app.services import google_calendar_service  # lazy import: only needed when connected

    try:
        google_calendar_service.upsert_event(db, event)
    except GoogleNotConnectedError:
        pass
    except Exception:  # best-effort 부수효과, 로그만 남기고 진행
        logger.exception("캘린더 이벤트 동기화 실패: %s", event.title)


def remove_from_google(event: Event) -> None:
    if not is_connected():
        return
    from app.services import google_calendar_service  # lazy import: only needed when connected

    try:
        google_calendar_service.delete_event(event)
    except GoogleNotConnectedError:
        pass
    except Exception:  # best-effort 부수효과, 로그만 남기고 진행
        logger.exception("캘린더 이벤트 삭제 실패: %s", event.title)
