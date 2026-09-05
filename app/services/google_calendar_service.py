import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.recurring_expense import RecurringExpense
from app.services.google_auth import get_credentials

logger = logging.getLogger(__name__)

CALENDAR_ID = "primary"
# Google이 "이 이벤트는 이제 없다"고 알려주는 상태 코드 — 이때만 링크를 끊고 재생성한다.
_GONE_STATUSES = {404, 410}
TIME_ZONE = "Asia/Seoul"
_RRULE_FREQ = {"weekly": "WEEKLY", "monthly": "MONTHLY"}


def _service():
    return build("calendar", "v3", credentials=get_credentials(), cache_discovery=False)


def _event_body(recurring: RecurringExpense) -> dict:
    due = recurring.next_due_date
    return {
        "summary": f"[Nestlio] {recurring.name} 납부일",
        "description": f"{recurring.category.name} - {recurring.amount:,.0f}원",
        "start": {"date": due.isoformat()},
        "end": {"date": (due + timedelta(days=1)).isoformat()},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": recurring.reminder_days_before * 24 * 60},
            ],
        },
    }


def upsert_event_for_recurring(db: Session, recurring: RecurringExpense) -> None:
    """Create or update the Calendar event for this recurring expense's next_due_date.
    Persists the resulting event id onto the recurring expense row."""
    service = _service()
    body = _event_body(recurring)
    if recurring.calendar_event_id:
        try:
            service.events().update(
                calendarId=CALENDAR_ID, eventId=recurring.calendar_event_id, body=body
            ).execute()
            db.commit()
            return
        except HttpError as e:
            if e.resp.status not in _GONE_STATUSES:
                raise
            # 구글 쪽에서 이벤트가 삭제된 경우에만 링크를 끊고 아래에서 재생성한다.
            # (네트워크/인증/429 등 일시적 오류에 재생성하면 캘린더에 중복 이벤트가 쌓인다)
            recurring.calendar_event_id = None

    created = service.events().insert(calendarId=CALENDAR_ID, body=body).execute()
    recurring.calendar_event_id = created["id"]
    db.commit()


def _event_body_for_event(event: Event) -> dict:
    if event.all_day:
        start = {"date": event.start_at.date().isoformat()}
        end_date = event.end_at.date() if event.end_at else event.start_at.date() + timedelta(days=1)
        end = {"date": end_date.isoformat()}
    else:
        start = {"dateTime": event.start_at.isoformat(), "timeZone": TIME_ZONE}
        end_dt = event.end_at or event.start_at + timedelta(hours=1)
        end = {"dateTime": end_dt.isoformat(), "timeZone": TIME_ZONE}

    body: dict = {
        "summary": event.title,
        "description": event.description or "",
        "location": event.location or "",
        "start": start,
        "end": end,
    }
    if event.frequency in _RRULE_FREQ:
        rrule = f"RRULE:FREQ={_RRULE_FREQ[event.frequency]}"
        if event.recurrence_end_date:
            rrule += f";UNTIL={event.recurrence_end_date.strftime('%Y%m%d')}"
        body["recurrence"] = [rrule]
    if event.reminder_minutes_before is not None:
        body["reminders"] = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": event.reminder_minutes_before}],
        }
    return body


def upsert_event(db: Session, event: Event) -> None:
    """Create or update the Calendar event mirroring this shared household event.
    Persists the resulting event id onto the event row."""
    service = _service()
    body = _event_body_for_event(event)
    if event.google_calendar_event_id:
        try:
            service.events().update(
                calendarId=CALENDAR_ID, eventId=event.google_calendar_event_id, body=body
            ).execute()
            db.commit()
            return
        except HttpError as e:
            if e.resp.status not in _GONE_STATUSES:
                raise
            # 구글 쪽에서 이벤트가 삭제된 경우에만 링크를 끊고 아래에서 재생성한다.
            event.google_calendar_event_id = None

    created = service.events().insert(calendarId=CALENDAR_ID, body=body).execute()
    event.google_calendar_event_id = created["id"]
    db.commit()


def list_events(range_start: date, range_end: date) -> list[dict]:
    """Fetch raw Google Calendar event resources overlapping [range_start, range_end]
    (inclusive), with recurring events expanded into individual instances (singleEvents=True)
    so callers never need to parse RRULEs. Cancelled events are excluded by default."""
    service = _service()
    tz = ZoneInfo(TIME_ZONE)
    time_min = datetime.combine(range_start, time.min, tzinfo=tz).isoformat()
    time_max = datetime.combine(range_end, time.max, tzinfo=tz).isoformat()

    items: list[dict] = []
    page_token: str | None = None
    while True:
        response = (
            service.events()
            .list(
                calendarId=CALENDAR_ID,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
                pageToken=page_token,
            )
            .execute()
        )
        items.extend(response.get("items", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return items


def delete_event(event: Event) -> None:
    if not event.google_calendar_event_id:
        return
    service = _service()
    try:
        service.events().delete(calendarId=CALENDAR_ID, eventId=event.google_calendar_event_id).execute()
    except HttpError as e:
        # 이미 지워진(404/410) 경우는 목표 달성이므로 무시하되, 그 외 오류는 로그로 남긴다.
        # 로컬 이벤트 삭제 자체는 계속 진행돼야 하므로 여기서 raise하지 않는다(best-effort).
        if e.resp.status not in _GONE_STATUSES:
            logger.exception("구글 캘린더 이벤트 삭제 실패 (event_id=%s)", event.google_calendar_event_id)
    except Exception:
        logger.exception("구글 캘린더 이벤트 삭제 중 예외 (event_id=%s)", event.google_calendar_event_id)
