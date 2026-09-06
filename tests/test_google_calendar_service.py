from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from googleapiclient.errors import HttpError

from app.models.category import Category
from app.models.recurring_expense import RecurringExpense
from app.services import google_calendar_service


def _http_error(status: int) -> HttpError:
    resp = MagicMock()
    resp.status = status
    resp.reason = "boom"
    return HttpError(resp, b"{}")


def test_event_body_maps_recurring_expense_fields():
    category = Category(name="구독료", type="fixed", color="#000000")
    recurring = RecurringExpense(
        name="넷플릭스",
        category=category,
        amount=Decimal("17000"),
        type="expense",
        frequency="monthly",
        start_date=date(2026, 1, 25),
        next_due_date=date(2026, 8, 25),
        reminder_days_before=3,
    )

    body = google_calendar_service._event_body(recurring)

    assert body["summary"] == "[Nestlio] 넷플릭스 납부일"
    assert body["start"] == {"date": "2026-08-25"}
    assert body["end"] == {"date": "2026-08-26"}
    assert body["reminders"]["overrides"][0]["minutes"] == 3 * 24 * 60


@patch("app.services.google_calendar_service._service")
def test_upsert_event_for_recurring_updates_when_event_id_exists(mock_service_factory, seeded_db):
    db, food = seeded_db["db"], seeded_db["food"]
    recurring = RecurringExpense(
        name="넷플릭스",
        category_id=food.id,
        amount=Decimal("17000"),
        type="expense",
        frequency="monthly",
        start_date=date(2026, 1, 25),
        next_due_date=date(2026, 8, 25),
        reminder_days_before=3,
        calendar_event_id="existing-event-id",
    )
    db.add(recurring)
    db.commit()
    mock_service_factory.return_value = MagicMock()

    google_calendar_service.upsert_event_for_recurring(db, recurring)

    mock_service = mock_service_factory.return_value
    mock_service.events.return_value.update.assert_called_once()
    mock_service.events.return_value.insert.assert_not_called()
    assert recurring.calendar_event_id == "existing-event-id"


@patch("app.services.google_calendar_service._service")
def test_upsert_event_for_recurring_inserts_when_no_event_id(mock_service_factory, seeded_db):
    db, food = seeded_db["db"], seeded_db["food"]
    recurring = RecurringExpense(
        name="넷플릭스",
        category_id=food.id,
        amount=Decimal("17000"),
        type="expense",
        frequency="monthly",
        start_date=date(2026, 1, 25),
        next_due_date=date(2026, 8, 25),
        reminder_days_before=3,
    )
    db.add(recurring)
    db.commit()
    mock_service = MagicMock()
    mock_service.events.return_value.insert.return_value.execute.return_value = {"id": "new-event-id"}
    mock_service_factory.return_value = mock_service

    google_calendar_service.upsert_event_for_recurring(db, recurring)

    mock_service.events.return_value.insert.assert_called_once()
    assert recurring.calendar_event_id == "new-event-id"


def _recurring_with_event_id(db, food_id, event_id="stale-id"):
    recurring = RecurringExpense(
        name="넷플릭스",
        category_id=food_id,
        amount=Decimal("17000"),
        type="expense",
        frequency="monthly",
        start_date=date(2026, 1, 25),
        next_due_date=date(2026, 8, 25),
        reminder_days_before=3,
        calendar_event_id=event_id,
    )
    db.add(recurring)
    db.commit()
    return recurring


@patch("app.services.google_calendar_service._service")
def test_upsert_recreates_only_when_google_reports_gone(mock_service_factory, seeded_db):
    """update가 404를 반환하면(구글에서 삭제됨) 링크를 끊고 재생성한다."""
    db, food = seeded_db["db"], seeded_db["food"]
    recurring = _recurring_with_event_id(db, food.id)
    mock_service = MagicMock()
    mock_service.events.return_value.update.return_value.execute.side_effect = _http_error(404)
    mock_service.events.return_value.insert.return_value.execute.return_value = {"id": "fresh-id"}
    mock_service_factory.return_value = mock_service

    google_calendar_service.upsert_event_for_recurring(db, recurring)

    mock_service.events.return_value.insert.assert_called_once()
    assert recurring.calendar_event_id == "fresh-id"


@patch("app.services.google_calendar_service._service")
def test_upsert_does_not_recreate_on_transient_error(mock_service_factory, seeded_db):
    """update가 500 등 일시적 오류면 재생성하지 않고 예외를 전파한다(중복 이벤트 방지)."""
    db, food = seeded_db["db"], seeded_db["food"]
    recurring = _recurring_with_event_id(db, food.id, event_id="keep-id")
    mock_service = MagicMock()
    mock_service.events.return_value.update.return_value.execute.side_effect = _http_error(500)
    mock_service_factory.return_value = mock_service

    with pytest.raises(HttpError):
        google_calendar_service.upsert_event_for_recurring(db, recurring)

    mock_service.events.return_value.insert.assert_not_called()
    assert recurring.calendar_event_id == "keep-id"


@patch("app.services.google_calendar_service._service")
def test_delete_event_swallows_errors(mock_service_factory, seeded_db):
    """delete는 best-effort — 404가 아닌 오류도 로그만 남기고 예외를 전파하지 않는다."""
    from app.models.event import Event

    event = Event(
        title="기념일",
        start_at=date(2026, 8, 1),
        all_day=True,
        google_calendar_event_id="gcal-id",
    )
    mock_service = MagicMock()
    mock_service.events.return_value.delete.return_value.execute.side_effect = _http_error(503)
    mock_service_factory.return_value = mock_service

    google_calendar_service.delete_event(event)  # does not raise
