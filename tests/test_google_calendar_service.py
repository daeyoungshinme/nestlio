from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models.category import Category
from app.models.recurring_expense import RecurringExpense
from app.services import google_calendar_service


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
