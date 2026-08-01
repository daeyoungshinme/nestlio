from datetime import date, timedelta

from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.recurring_expense import RecurringExpense
from app.services.google_auth import get_credentials

CALENDAR_ID = "primary"
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
        except Exception:
            # event may have been deleted on the Google side - fall through and recreate
            recurring.calendar_event_id = None

    created = service.events().insert(calendarId=CALENDAR_ID, body=body).execute()
    recurring.calendar_event_id = created["id"]
    db.commit()


def delete_event_for_recurring(recurring: RecurringExpense) -> None:
    if not recurring.calendar_event_id:
        return
    service = _service()
    try:
        service.events().delete(calendarId=CALENDAR_ID, eventId=recurring.calendar_event_id).execute()
    except Exception:
        pass


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
        except Exception:
            # event may have been deleted on the Google side - fall through and recreate
            event.google_calendar_event_id = None

    created = service.events().insert(calendarId=CALENDAR_ID, body=body).execute()
    event.google_calendar_event_id = created["id"]
    db.commit()


def delete_event(event: Event) -> None:
    if not event.google_calendar_event_id:
        return
    service = _service()
    try:
        service.events().delete(calendarId=CALENDAR_ID, eventId=event.google_calendar_event_id).execute()
    except Exception:
        pass
