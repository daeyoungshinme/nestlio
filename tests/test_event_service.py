from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.event import Event
from app.models.user import User
from app.services import event_service
from app.services.event_service import ImportedEventReadOnlyError
from app.services.google_auth import GoogleNotConnectedError


def _spouse2(db):
    user = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_occurrences_once_within_and_outside_range(seeded_db):
    user = seeded_db["user"]
    event = event_service.create_event(
        seeded_db["db"], created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0)
    )

    assert event_service._occurrences_in_range(event, date(2026, 7, 1), date(2026, 7, 31)) == [
        datetime(2026, 7, 15, 10, 0)
    ]
    assert event_service._occurrences_in_range(event, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_occurrences_weekly_expands_across_range(seeded_db):
    user = seeded_db["user"]
    event = event_service.create_event(
        seeded_db["db"],
        created_by=user.id,
        title="장보기",
        start_at=datetime(2026, 7, 1, 9, 0),
        frequency="weekly",
    )

    occurrences = event_service._occurrences_in_range(event, date(2026, 7, 1), date(2026, 7, 31))

    assert occurrences == [
        datetime(2026, 7, 1, 9, 0),
        datetime(2026, 7, 8, 9, 0),
        datetime(2026, 7, 15, 9, 0),
        datetime(2026, 7, 22, 9, 0),
        datetime(2026, 7, 29, 9, 0),
    ]


def test_occurrences_monthly_stops_at_recurrence_end_date(seeded_db):
    user = seeded_db["user"]
    event = event_service.create_event(
        seeded_db["db"],
        created_by=user.id,
        title="월간 정산",
        start_at=datetime(2026, 6, 1, 8, 0),
        frequency="monthly",
        recurrence_end_date=date(2026, 8, 15),
    )

    occurrences = event_service._occurrences_in_range(event, date(2026, 6, 1), date(2026, 12, 31))

    assert occurrences == [datetime(2026, 6, 1, 8, 0), datetime(2026, 7, 1, 8, 0), datetime(2026, 8, 1, 8, 0)]


def test_list_events_includes_recurring_occurrences_in_range(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    event_service.create_event(
        db, created_by=user.id, title="장보기", start_at=datetime(2026, 7, 1, 9, 0), frequency="weekly"
    )
    event_service.create_event(db, created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0))

    results = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))

    assert len(results) == 6  # 5 weekly occurrences + 1 single event
    assert results[0]["occurrence_start"] <= results[-1]["occurrence_start"]


def test_create_update_delete_event(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    event = event_service.create_event(db, created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0))

    updated = event_service.update_event(
        db,
        event.id,
        actor_id=user.id,
        title="병원 (변경)",
        description=None,
        location=None,
        all_day=False,
        start_at=datetime(2026, 7, 16, 11, 0),
        end_at=None,
        frequency="once",
        recurrence_end_date=None,
        reminder_minutes_before=None,
    )
    assert updated.title == "병원 (변경)"
    assert updated.start_at == datetime(2026, 7, 16, 11, 0)

    assert event_service.delete_event(db, event.id, actor_id=user.id) is True
    assert event_service.get_event(db, event.id) is None
    assert event_service.delete_event(db, event.id, actor_id=user.id) is False


def test_create_and_update_event_assignee(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)

    event = event_service.create_event(
        db, created_by=user.id, title="장보기", start_at=datetime(2026, 7, 15, 10, 0), assignee_id=user.id
    )
    assert event.assignee_id == user.id

    updated = event_service.update_event(
        db,
        event.id,
        actor_id=user.id,
        title="장보기",
        description=None,
        location=None,
        all_day=False,
        start_at=datetime(2026, 7, 15, 10, 0),
        end_at=None,
        frequency="once",
        recurrence_end_date=None,
        reminder_minutes_before=None,
        assignee_id=spouse2.id,
    )
    assert updated.assignee_id == spouse2.id

    # assignee_id=None -> 공동(두 사람 모두 담당)
    reset = event_service.update_event(
        db,
        event.id,
        actor_id=user.id,
        title="장보기",
        description=None,
        location=None,
        all_day=False,
        start_at=datetime(2026, 7, 15, 10, 0),
        end_at=None,
        frequency="once",
        recurrence_end_date=None,
        reminder_minutes_before=None,
        assignee_id=None,
    )
    assert reset.assignee_id is None


def test_set_completed_toggles_completed_at(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    event = event_service.create_event(db, created_by=user.id, title="장보기", start_at=datetime(2026, 7, 15, 10, 0))
    assert event.completed_at is None

    done = event_service.set_completed(db, event.id, completed=True, now=datetime(2026, 7, 15, 12, 0))
    assert done.completed_at == datetime(2026, 7, 15, 12, 0)

    undone = event_service.set_completed(db, event.id, completed=False)
    assert undone.completed_at is None

    assert event_service.set_completed(db, 999999, completed=True) is None


def test_set_completed_allowed_on_imported_event(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    imported = Event(
        title="치과 예약",
        start_at=datetime(2026, 7, 10, 9, 0),
        all_day=False,
        frequency="once",
        source="google_import",
        google_calendar_event_id="gcal-1",
        created_by=user.id,
    )
    db.add(imported)
    db.commit()
    db.refresh(imported)

    done = event_service.set_completed(db, imported.id, completed=True, now=datetime(2026, 7, 10, 12, 0))

    assert done.completed_at == datetime(2026, 7, 10, 12, 0)


@patch("app.services.event_service.gmail_service.send_email")
@patch("app.services.event_service.is_connected", return_value=True)
def test_create_event_notifies_other_spouse_only(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)

    event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    mock_send.assert_called_once()
    _, kwargs = mock_send.call_args
    assert kwargs["to"] == [spouse2.email]


@patch("app.services.event_service.gmail_service.send_email")
@patch("app.services.event_service.is_connected", return_value=True)
def test_send_due_reminders_is_deduped(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event = event_service.create_event(
        db,
        created_by=user.id,
        title="병원",
        start_at=datetime(2026, 7, 15, 10, 0),
        reminder_minutes_before=60,
    )
    mock_send.reset_mock()  # ignore the "event created" notification sent above

    now = datetime(2026, 7, 15, 9, 0)
    first = event_service.send_due_reminders(db, now=now, window_minutes=15)
    second = event_service.send_due_reminders(db, now=now, window_minutes=15)

    assert first == 1
    assert second == 0
    assert mock_send.call_count == 1
    assert event.id  # sanity: event row still intact


@patch("app.services.event_service.gmail_service.send_email")
@patch("app.services.event_service.is_connected", return_value=False)
def test_no_notification_when_google_not_connected(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)

    event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    mock_send.assert_not_called()


@patch("app.services.event_service.is_connected", return_value=False)
def test_import_from_google_requires_connection(mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with pytest.raises(GoogleNotConnectedError):
        event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_import_from_google_creates_readonly_events(mock_connected, mock_list, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    mock_list.return_value = [
        {
            "id": "gcal-1",
            "summary": "치과 예약",
            "start": {"dateTime": "2026-07-10T09:00:00+09:00"},
            "end": {"dateTime": "2026-07-10T10:00:00+09:00"},
        }
    ]

    result = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    assert result == {"created": 1, "updated": 0, "skipped": 0}
    items = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))
    assert len(items) == 1
    assert items[0]["source"] == "google_import"
    assert items[0]["start_at"] == datetime(2026, 7, 10, 9, 0)


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_import_from_google_is_idempotent(mock_connected, mock_list, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    mock_list.return_value = [
        {
            "id": "gcal-1",
            "summary": "치과 예약",
            "start": {"dateTime": "2026-07-10T09:00:00+09:00"},
            "end": {"dateTime": "2026-07-10T10:00:00+09:00"},
        }
    ]
    first = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    mock_list.return_value = [
        {
            "id": "gcal-1",
            "summary": "치과 예약 (변경)",
            "start": {"dateTime": "2026-07-10T09:30:00+09:00"},
            "end": {"dateTime": "2026-07-10T10:30:00+09:00"},
        }
    ]
    second = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    assert first == {"created": 1, "updated": 0, "skipped": 0}
    assert second == {"created": 0, "updated": 1, "skipped": 0}
    items = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))
    assert len(items) == 1
    assert items[0]["title"] == "치과 예약 (변경)"


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_import_from_google_skips_own_recurring_event(mock_connected, mock_list, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    native = Event(
        title="장보기",
        start_at=datetime(2026, 7, 1, 9, 0),
        all_day=False,
        frequency="weekly",
        source="native",
        google_calendar_event_id="master-1",
        created_by=user.id,
    )
    db.add(native)
    db.commit()

    mock_list.return_value = [
        {
            "id": "master-1_20260708T000000Z",
            "recurringEventId": "master-1",
            "summary": "장보기",
            "start": {"dateTime": "2026-07-08T09:00:00+09:00"},
            "end": {"dateTime": "2026-07-08T10:00:00+09:00"},
        }
    ]

    result = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    assert result == {"created": 0, "updated": 0, "skipped": 0}
    items = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))
    assert all(item["source"] == "native" for item in items)


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_import_from_google_all_day_end_date_inverts_google_exclusive_end(mock_connected, mock_list, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    mock_list.return_value = [
        {
            "id": "gcal-2",
            "summary": "여행",
            "start": {"date": "2026-07-10"},
            "end": {"date": "2026-07-13"},  # Google 종료일은 배타적 -> 실제 마지막 날은 7/12
        }
    ]

    event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    items = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))
    assert items[0]["all_day"] is True
    assert items[0]["end_at"] == datetime(2026, 7, 12, 0, 0)


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_import_from_google_skips_recurring_expense_pushed_event(mock_connected, mock_list, seeded_db):
    from app.services import recurring_service

    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"), frequency="monthly",
        start_date=date(2026, 7, 5), created_by=user.id,
    )
    recurring.calendar_event_id = "recurring-1"
    db.commit()

    mock_list.return_value = [
        {
            "id": "recurring-1",
            "summary": "[Nestlio] 월세 납부일",
            "start": {"date": "2026-07-05"},
            "end": {"date": "2026-07-06"},
        }
    ]

    result = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    assert result == {"created": 0, "updated": 0, "skipped": 0}
    items = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))
    assert items == []


def test_update_imported_event_is_read_only(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    imported = Event(
        title="치과 예약",
        start_at=datetime(2026, 7, 10, 9, 0),
        all_day=False,
        frequency="once",
        source="google_import",
        google_calendar_event_id="gcal-1",
        created_by=user.id,
    )
    db.add(imported)
    db.commit()
    db.refresh(imported)

    with pytest.raises(ImportedEventReadOnlyError):
        event_service.update_event(db, imported.id, actor_id=user.id, title="변경 시도")


def test_delete_imported_event_is_soft_deleted_and_hidden_from_list(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    imported = Event(
        title="치과 예약",
        start_at=datetime(2026, 7, 10, 9, 0),
        all_day=False,
        frequency="once",
        source="google_import",
        google_calendar_event_id="gcal-1",
        created_by=user.id,
    )
    db.add(imported)
    db.commit()
    db.refresh(imported)

    deleted = event_service.delete_event(db, imported.id, actor_id=user.id, now=datetime(2026, 7, 11, 12, 0))

    assert deleted is True
    db.refresh(imported)
    assert imported.dismissed_at == datetime(2026, 7, 11, 12, 0)
    assert event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31)) == []
    # 소프트 삭제이므로 행 자체는 여전히 DB에 남아 있어야 한다.
    assert db.get(Event, imported.id) is not None


@patch("app.services.google_calendar_service.list_events")
@patch("app.services.event_service.is_connected", return_value=True)
def test_dismissed_imported_event_does_not_revive_on_reimport(mock_connected, mock_list, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    mock_list.return_value = [
        {
            "id": "gcal-1",
            "summary": "치과 예약",
            "start": {"dateTime": "2026-07-10T09:00:00+09:00"},
            "end": {"dateTime": "2026-07-10T10:00:00+09:00"},
        }
    ]
    first = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)
    assert first == {"created": 1, "updated": 0, "skipped": 0}

    imported = event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31))[0]
    deleted = event_service.delete_event(
        db, imported["id"], actor_id=user.id, now=datetime(2026, 7, 11, 12, 0)
    )
    assert deleted is True

    # 구글 원본 이벤트는 여전히 존재한다고 가정 - 같은 기간을 다시 import해도 되살아나면 안 된다.
    second = event_service.import_from_google(db, date(2026, 7, 1), date(2026, 7, 31), actor_id=user.id)

    assert second == {"created": 0, "updated": 0, "skipped": 1}
    assert event_service.list_events(db, date(2026, 7, 1), date(2026, 7, 31)) == []
