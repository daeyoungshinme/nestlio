from datetime import date, datetime
from unittest.mock import patch

from app.models.event import Event
from app.models.user import User
from app.services import event_reminder_service, event_service


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

    assert event_service.occurrences_in_range(event, date(2026, 7, 1), date(2026, 7, 31)) == [
        datetime(2026, 7, 15, 10, 0)
    ]
    assert event_service.occurrences_in_range(event, date(2026, 8, 1), date(2026, 8, 31)) == []


def test_occurrences_weekly_expands_across_range(seeded_db):
    user = seeded_db["user"]
    event = event_service.create_event(
        seeded_db["db"],
        created_by=user.id,
        title="장보기",
        start_at=datetime(2026, 7, 1, 9, 0),
        frequency="weekly",
    )

    occurrences = event_service.occurrences_in_range(event, date(2026, 7, 1), date(2026, 7, 31))

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

    occurrences = event_service.occurrences_in_range(event, date(2026, 6, 1), date(2026, 12, 31))

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
    assert db.get(Event, event.id) is None
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


@patch("app.services.event_reminder_service.gmail_service.send_email")
@patch("app.services.event_reminder_service.is_connected", return_value=True)
def test_create_event_notifies_other_spouse_only(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)

    event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    mock_send.assert_called_once()
    _, kwargs = mock_send.call_args
    assert kwargs["to"] == [spouse2.email]


@patch("app.services.event_reminder_service.gmail_service.send_email")
@patch("app.services.event_reminder_service.is_connected", return_value=True)
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
    first = event_reminder_service.send_due_reminders(db, now=now, window_minutes=15)
    second = event_reminder_service.send_due_reminders(db, now=now, window_minutes=15)

    assert first == 1
    assert second == 0
    assert mock_send.call_count == 1
    assert event.id  # sanity: event row still intact


@patch("app.services.event_reminder_service.gmail_service.send_email")
@patch("app.services.event_reminder_service.is_connected", return_value=True)
def test_send_due_reminders_wide_window_catches_delayed_tick(mock_connected, mock_send, seeded_db):
    """리마인더 시각(09:00)을 겨냥한 cron 틱이 통째로 밀려도, 다음 틱이 30분 윈도우로
    소급해서 잡아야 한다 — GitHub Actions cron이 best-effort라서."""
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event_service.create_event(
        db, created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0), reminder_minutes_before=60
    )
    mock_send.reset_mock()

    # 09:00 틱은 누락됐고 09:20에야 실행됨 — 15분 윈도우였다면 놓쳤을 것
    late = event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 20), window_minutes=30)
    assert late == 1


@patch("app.services.event_reminder_service.gmail_service.send_email")
@patch("app.services.event_reminder_service.is_connected", return_value=True)
def test_send_due_reminders_retries_after_send_failure(mock_connected, mock_send, seeded_db):
    """Gmail 일시 장애로 실패한 리마인더는 "보냄"으로 기록되지 않아 다음 틱에 다시 보낸다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event_service.create_event(
        db, created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0), reminder_minutes_before=60
    )
    mock_send.reset_mock()
    mock_send.side_effect = RuntimeError("gmail down")
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 0)) == 0

    mock_send.side_effect = None
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 15)) == 1


@patch("app.services.event_reminder_service.gmail_service.send_email")
@patch("app.services.event_reminder_service.is_connected", return_value=False)
def test_no_notification_when_google_not_connected(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)

    event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    mock_send.assert_not_called()


