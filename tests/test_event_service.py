from datetime import date, datetime
from unittest.mock import patch

from app.models.event import Event
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.services import event_reminder_service, event_service
from app.services.gmail_service import GmailSendError


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

    deleted = event_service.delete_event(db, event.id)
    assert deleted.title == "병원 (변경)"  # 배우자 알림용으로 삭제된 객체를 돌려준다
    assert db.get(Event, event.id) is None
    assert event_service.delete_event(db, event.id) is None


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


_SEND = "app.services.notification_service.gmail_service.send_email"
_CONNECTED = "app.services.notification_service.is_connected"


def _event_with_reminder(db, user, title="병원"):
    return event_service.create_event(
        db, created_by=user.id, title=title, start_at=datetime(2026, 7, 15, 10, 0), reminder_minutes_before=60
    )


def _reminder_logs(db):
    return db.query(NotificationLog).filter(NotificationLog.notif_type == "event_reminder").all()


@patch(_SEND)
@patch(_CONNECTED, return_value=True)
def test_crud_itself_sends_no_mail_and_notify_excludes_actor(mock_connected, mock_send, seeded_db):
    """배우자 알림은 라우터가 저장 뒤 따로 부른다 — event_service(CRUD)는 알림 모듈에 의존하지 않는다."""
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)

    event = event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))
    mock_send.assert_not_called()

    event_reminder_service.notify_other_spouse_best_effort(db, event, user.id, "새 일정이 등록되었습니다")
    mock_send.assert_called_once()
    args, kwargs = mock_send.call_args
    assert kwargs["to"] == [spouse2.email]
    assert args[0] == "[Nestlio] 새 일정이 등록되었습니다: 여행"


@patch(_SEND, side_effect=RuntimeError("boom"))
@patch(_CONNECTED, return_value=True)
def test_notify_other_spouse_swallows_unexpected_errors(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event = event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    event_reminder_service.notify_other_spouse_best_effort(db, event, user.id, "일정이 변경되었습니다")  # no raise


@patch(_SEND)
@patch(_CONNECTED, return_value=False)
def test_notify_other_spouse_skips_mail_when_google_not_connected(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event = event_service.create_event(db, created_by=user.id, title="여행", start_at=datetime(2026, 8, 1, 9, 0))

    event_reminder_service.notify_other_spouse_best_effort(db, event, user.id, "새 일정이 등록되었습니다")

    mock_send.assert_not_called()


@patch(_SEND)
@patch(_CONNECTED, return_value=True)
def test_send_due_reminders_is_deduped(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    event = _event_with_reminder(db, user)

    now = datetime(2026, 7, 15, 9, 0)
    first = event_reminder_service.send_due_reminders(db, now=now, window_minutes=15)
    second = event_reminder_service.send_due_reminders(db, now=now, window_minutes=15)

    assert first == 1
    assert second == 0
    assert mock_send.call_count == 1
    [log] = _reminder_logs(db)
    assert (log.related_type, log.related_id, log.year_month) == ("event", event.id, "2026-07-15T10:00:00")
    assert "병원" in log.detail  # 인앱 알림함에 리마인더 내용이 보인다


@patch(_SEND)
@patch(_CONNECTED, return_value=True)
def test_send_due_reminders_wide_window_catches_delayed_tick(mock_connected, mock_send, seeded_db):
    """리마인더 시각(09:00)을 겨냥한 cron 틱이 통째로 밀려도, 다음 틱이 30분 윈도우로
    소급해서 잡아야 한다 — GitHub Actions cron이 best-effort라서."""
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    _event_with_reminder(db, user)

    # 09:00 틱은 누락됐고 09:20에야 실행됨 — 15분 윈도우였다면 놓쳤을 것
    late = event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 20), window_minutes=30)
    assert late == 1


@patch(_SEND)
@patch(_CONNECTED, return_value=True)
def test_send_due_reminders_retries_after_gmail_failure(mock_connected, mock_send, seeded_db):
    """Gmail 일시 장애로 실패한 리마인더는 기록되지 않아 다음 틱에 다시 보낸다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    _event_with_reminder(db, user)

    mock_send.side_effect = GmailSendError("gmail down")
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 0)) == 0
    assert _reminder_logs(db) == []

    mock_send.side_effect = None
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 15)) == 1


@patch(_SEND)
@patch(_CONNECTED, return_value=True)
def test_one_unexpected_reminder_error_does_not_block_others(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    _event_with_reminder(db, user, title="병원")
    _event_with_reminder(db, user, title="미용실")

    mock_send.side_effect = [RuntimeError("boom"), None]
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 0)) == 1
    assert len(_reminder_logs(db)) == 1


@patch(_SEND)
@patch(_CONNECTED, return_value=False)
def test_reminders_still_logged_in_app_when_google_not_connected(mock_connected, mock_send, seeded_db):
    """Gmail이 끊겨도 인앱 리마인더는 남는다 — 메일만 건너뛴다(재시도해도 같으므로 다시 시도하지 않음)."""
    db, user = seeded_db["db"], seeded_db["user"]
    _event_with_reminder(db, user)

    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 0)) == 1
    assert event_reminder_service.send_due_reminders(db, now=datetime(2026, 7, 15, 9, 15)) == 0
    mock_send.assert_not_called()
    assert len(_reminder_logs(db)) == 1
