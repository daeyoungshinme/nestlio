import uuid
from datetime import date, datetime
from unittest.mock import patch

import pytest

from app.models.notification_log import NotificationLog
from app.models.notification_read import NotificationRead
from app.models.todo import Todo
from app.models.todo_completion import TodoCompletion
from app.models.user import User
from app.services import notification_settings_service, todo_notification_service, todo_service


def _spouse2(db):
    user = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create(seeded_db, **kwargs):
    kwargs.setdefault("title", "분리수거")
    return todo_service.create_todo(seeded_db["db"], created_by=seeded_db["user"].id, **kwargs)


def _complete(seeded_db, todo_id, completed=True, now=datetime(2026, 7, 1, 9, 0)):
    return todo_service.set_completed(
        seeded_db["db"], todo_id, completed=completed, actor_id=seeded_db["user"].id, now=now
    )


def _next(db, todo_id):
    return db.query(Todo).filter(Todo.previous_todo_id == todo_id).one_or_none()


def _inbox(db):
    return db.query(NotificationLog).filter_by(notif_type="todo").order_by(NotificationLog.id).all()


# --- 목록 ---------------------------------------------------------------------------------------


def test_list_open_sorts_by_due_date_with_no_due_date_last(seeded_db):
    no_due = _create(seeded_db, title="기한 없음")
    later = _create(seeded_db, title="나중", due_date=date(2026, 8, 1))
    sooner = _create(seeded_db, title="먼저", due_date=date(2026, 7, 1))

    assert [t.id for t in todo_service.list_todos(seeded_db["db"], "open")] == [sooner.id, later.id, no_due.id]


def test_list_separates_open_and_done(seeded_db):
    done = _create(seeded_db, title="끝남")
    still_open = _create(seeded_db, title="진행 중")
    _complete(seeded_db, done.id)

    assert [t.id for t in todo_service.list_todos(seeded_db["db"], "open")] == [still_open.id]
    assert [t.id for t in todo_service.list_todos(seeded_db["db"], "done")] == [done.id]


# --- 담당자 검증 ---------------------------------------------------------------------------------


def test_create_rejects_unknown_assignee(seeded_db):
    with pytest.raises(todo_service.TodoAssigneeNotFoundError):
        _create(seeded_db, assignee_id=uuid.uuid4())


def test_create_rejects_removed_assignee(seeded_db):
    db = seeded_db["db"]
    spouse2 = _spouse2(db)
    spouse2.removed_at = datetime(2026, 7, 1)
    db.commit()

    with pytest.raises(todo_service.TodoAssigneeNotFoundError):
        _create(seeded_db, assignee_id=spouse2.id)


def test_update_keeps_already_removed_assignee(seeded_db):
    """이미 제거된 배우자가 담당인 할일도 다른 칸은 고칠 수 있어야 한다."""
    db = seeded_db["db"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, assignee_id=spouse2.id)
    spouse2.removed_at = datetime(2026, 7, 1)
    db.commit()

    updated, previous = todo_service.update_todo(
        db, todo.id, title="새 제목", memo=None, due_date=None, frequency="once", assignee_id=spouse2.id
    )

    assert updated.title == "새 제목"
    assert previous == spouse2.id


def test_update_missing_returns_none(seeded_db):
    assert (
        todo_service.update_todo(
            seeded_db["db"], 999, title="x", memo=None, due_date=None, frequency="once", assignee_id=None
        )
        is None
    )


# --- 완료 토글과 반복 ----------------------------------------------------------------------------


def test_complete_once_records_completer_and_creates_no_next(seeded_db):
    todo = _create(seeded_db, due_date=date(2026, 7, 1))

    completed, outcome = _complete(seeded_db, todo.id)

    assert outcome == "completed"
    assert completed.completed_at == datetime(2026, 7, 1, 9, 0)
    assert completed.completed_by == seeded_db["user"].id
    assert _next(seeded_db["db"], todo.id) is None


@pytest.mark.parametrize(
    "frequency,due,expected",
    [
        ("weekly", date(2026, 7, 1), date(2026, 7, 8)),
        ("monthly", date(2026, 7, 1), date(2026, 8, 1)),
        ("yearly", date(2026, 7, 1), date(2027, 7, 1)),
    ],
)
def test_complete_recurring_creates_next_occurrence(seeded_db, frequency, due, expected):
    db = seeded_db["db"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, memo="메모", due_date=due, frequency=frequency, assignee_id=spouse2.id)

    _complete(seeded_db, todo.id)

    next_todo = _next(db, todo.id)
    assert next_todo.due_date == expected
    assert (next_todo.title, next_todo.memo, next_todo.frequency) == ("분리수거", "메모", frequency)
    assert next_todo.assignee_id == spouse2.id
    assert next_todo.completed_at is None


def test_overdue_recurring_skips_to_first_date_after_today(seeded_db):
    """3주 밀린 주간 할일을 끝내도 이미 지난 회차가 새 할일로 쌓이지 않는다."""
    todo = _create(seeded_db, due_date=date(2026, 6, 10), frequency="weekly")

    _complete(seeded_db, todo.id, now=datetime(2026, 7, 1, 9, 0))

    assert _next(seeded_db["db"], todo.id).due_date == date(2026, 7, 8)


def test_completing_early_advances_from_due_date(seeded_db):
    todo = _create(seeded_db, due_date=date(2026, 7, 20), frequency="weekly")

    _complete(seeded_db, todo.id, now=datetime(2026, 7, 1, 9, 0))

    assert _next(seeded_db["db"], todo.id).due_date == date(2026, 7, 27)


def test_monthly_31st_returns_to_31st_after_short_month(seeded_db):
    db = seeded_db["db"]
    jan = _create(seeded_db, due_date=date(2026, 1, 31), frequency="monthly")

    _complete(seeded_db, jan.id, now=datetime(2026, 1, 31, 9, 0))
    feb = _next(db, jan.id)
    assert feb.due_date == date(2026, 2, 28)

    _complete(seeded_db, feb.id, now=datetime(2026, 2, 28, 9, 0))
    assert _next(db, feb.id).due_date == date(2026, 3, 31)


def test_editing_clamped_occurrence_without_changing_due_date_keeps_anchor(seeded_db):
    """2월 28일 회차의 제목만 고쳐도(PUT은 전체 교체) 기준일 31일이 28일로 밀리면 안 된다."""
    db = seeded_db["db"]
    jan = _create(seeded_db, due_date=date(2026, 1, 31), frequency="monthly")
    _complete(seeded_db, jan.id, now=datetime(2026, 1, 31, 9, 0))
    feb = _next(db, jan.id)

    todo_service.update_todo(
        db, feb.id, title="새 제목", memo=None, due_date=feb.due_date, frequency="monthly", assignee_id=None
    )
    _complete(seeded_db, feb.id, now=datetime(2026, 2, 28, 9, 0))

    assert _next(db, feb.id).due_date == date(2026, 3, 31)


def test_changing_due_date_resets_anchor(seeded_db):
    db = seeded_db["db"]
    todo = _create(seeded_db, due_date=date(2026, 1, 31), frequency="monthly")

    todo_service.update_todo(
        db, todo.id, title="분리수거", memo=None, due_date=date(2026, 2, 10), frequency="monthly", assignee_id=None
    )
    _complete(seeded_db, todo.id, now=datetime(2026, 2, 10, 9, 0))

    assert _next(db, todo.id).due_date == date(2026, 3, 10)


def test_completing_twice_creates_one_next_occurrence(seeded_db):
    db = seeded_db["db"]
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly")

    assert _complete(seeded_db, todo.id)[1] == "completed"
    assert _complete(seeded_db, todo.id, now=datetime(2026, 7, 2, 9, 0))[1] == "none"

    assert db.query(Todo).filter(Todo.previous_todo_id == todo.id).count() == 1
    # 먼저 체크한 시각이 유지된다
    assert db.get(Todo, todo.id).completed_at == datetime(2026, 7, 1, 9, 0)


def test_uncomplete_removes_open_next_occurrence(seeded_db):
    db = seeded_db["db"]
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly")
    _complete(seeded_db, todo.id)

    reopened, outcome = _complete(seeded_db, todo.id, completed=False)

    assert outcome == "reopened"
    assert reopened.completed_at is None
    assert reopened.completed_by is None
    assert _next(db, todo.id) is None


def test_uncomplete_keeps_completed_next_and_recomplete_does_not_duplicate(seeded_db):
    db = seeded_db["db"]
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly")
    _complete(seeded_db, todo.id)
    next_todo = _next(db, todo.id)
    _complete(seeded_db, next_todo.id, now=datetime(2026, 7, 8, 9, 0))

    _complete(seeded_db, todo.id, completed=False)
    assert _next(db, todo.id).id == next_todo.id

    _complete(seeded_db, todo.id, now=datetime(2026, 7, 9, 9, 0))
    assert db.query(Todo).filter(Todo.previous_todo_id == todo.id).count() == 1


def test_complete_missing_returns_none(seeded_db):
    assert _complete(seeded_db, 999) is None


def test_stopping_recurrence_creates_no_next(seeded_db):
    db = seeded_db["db"]
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly")
    todo_service.update_todo(
        db, todo.id, title="분리수거", memo=None, due_date=date(2026, 7, 1), frequency="once", assignee_id=None
    )

    _complete(seeded_db, todo.id)

    assert _next(db, todo.id) is None


# --- 각자 완료 ------------------------------------------------------------------------------------


def _complete_as(db, user, todo_id, completed=True, now=datetime(2026, 7, 1, 9, 0)):
    return todo_service.set_completed(db, todo_id, completed=completed, actor_id=user.id, now=now)


def test_each_completes_stays_open_until_both_check(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, title="건강검진", each_completes=True)

    partial, outcome = _complete_as(db, user, todo.id)
    assert outcome == "partial"
    assert partial.completed_at is None
    assert [c.user_id for c in partial.completions] == [user.id]

    done, outcome = _complete_as(db, spouse2, todo.id, now=datetime(2026, 7, 2, 9, 0))
    assert outcome == "completed"
    assert done.completed_at == datetime(2026, 7, 2, 9, 0)
    assert done.completed_by == spouse2.id
    assert {c.user_id for c in done.completions} == {user.id, spouse2.id}


def test_each_completes_duplicate_check_is_noop(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    todo = _create(seeded_db, each_completes=True)
    _complete_as(db, user, todo.id)

    again, outcome = _complete_as(db, user, todo.id)

    assert outcome == "none"
    assert len(again.completions) == 1


def test_each_completes_recurring_creates_one_next_with_flag(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly", each_completes=True)

    _complete_as(db, user, todo.id)
    assert _next(db, todo.id) is None
    _complete_as(db, spouse2, todo.id)

    next_todo = _next(db, todo.id)
    assert next_todo.each_completes is True
    assert next_todo.completions == []


def test_each_completes_uncheck_after_done_reopens_and_removes_next(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly", each_completes=True)
    _complete_as(db, user, todo.id)
    _complete_as(db, spouse2, todo.id)

    reopened, outcome = _complete_as(db, user, todo.id, completed=False)

    assert outcome == "reopened"
    assert reopened.completed_at is None
    assert [c.user_id for c in reopened.completions] == [spouse2.id]
    assert _next(db, todo.id) is None


def test_each_completes_uncheck_partial_only_removes_own_check(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    todo = _create(seeded_db, each_completes=True)
    _complete_as(db, user, todo.id)

    unchecked, outcome = _complete_as(db, user, todo.id, completed=False)

    assert outcome == "none"
    assert unchecked.completions == []
    assert unchecked.completed_at is None


def test_each_completes_ignores_removed_spouse(seeded_db):
    """혼자 남은 가구(배우자 제거·미가입)는 한 명이 체크하면 끝난다."""
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    spouse2.removed_at = datetime(2026, 6, 1)
    db.commit()
    todo = _create(seeded_db, each_completes=True)

    done, outcome = _complete_as(db, user, todo.id)

    assert outcome == "completed"
    assert done.completed_at is not None


def test_priority_saved_updated_and_copied_to_next(seeded_db):
    db = seeded_db["db"]
    assert _create(seeded_db).priority == "normal"
    todo = _create(seeded_db, due_date=date(2026, 7, 1), frequency="weekly", priority="urgent")
    assert todo.priority == "urgent"

    _complete(seeded_db, todo.id)
    assert _next(db, todo.id).priority == "urgent"

    updated, _ = todo_service.update_todo(
        db, todo.id, title=todo.title, memo=None, due_date=todo.due_date, frequency="weekly", assignee_id=None
    )
    assert updated.priority == "normal"


def test_turning_off_each_completes_clears_checks(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    todo = _create(seeded_db, each_completes=True)
    _complete_as(db, user, todo.id)

    updated, _ = todo_service.update_todo(
        db, todo.id, title="분리수거", memo=None, due_date=None, frequency="once", assignee_id=None, each_completes=False
    )

    assert updated.each_completes is False
    assert updated.completions == []
    assert updated.completed_at is None
    # 이제는 한 명만 체크해도 끝난다
    assert _complete_as(db, user, todo.id)[1] == "completed"


def test_deleting_todo_removes_its_checks(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    todo = _create(seeded_db, each_completes=True)
    _complete_as(db, user, todo.id)

    todo_service.delete_todo(db, todo.id)

    assert db.query(TodoCompletion).count() == 0


# --- 알림 ---------------------------------------------------------------------------------------


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_notify_created_for_partner_logs_inbox_read_by_actor_and_mails_partner(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, title="세금 신고", due_date=date(2026, 7, 10), assignee_id=spouse2.id)

    todo_notification_service.notify_created(db, todo, user, now=datetime(2026, 7, 1, 9, 0))

    log = _inbox(db)[0]
    assert (log.related_type, log.related_id) == ("todo", todo.id)
    assert log.year_month == "2026-07-01T09:00:00"
    assert log.detail == "Spouse 1님이 새 할일을 등록했어요: 세금 신고"
    assert db.query(NotificationRead).filter_by(notification_log_id=log.id, user_id=user.id).count() == 1
    assert db.query(NotificationRead).filter_by(notification_log_id=log.id, user_id=spouse2.id).count() == 0

    mock_send.assert_called_once()
    assert mock_send.call_args.args[0] == "[Nestlio] 새 할일이 등록되었습니다: 세금 신고"
    assert mock_send.call_args.kwargs["to"] == [spouse2.email]
    body = mock_send.call_args.args[1]
    assert "담당: Spouse 2" in body
    assert "기한: 2026-07-10" in body


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_notify_created_shared_todo_notifies(mock_connected, mock_send, seeded_db):
    db = seeded_db["db"]
    _spouse2(db)
    todo = _create(seeded_db)

    todo_notification_service.notify_created(db, todo, seeded_db["user"])

    assert len(_inbox(db)) == 1
    assert "담당: 공동" in mock_send.call_args.args[1]


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_notify_created_for_self_is_silent(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    todo = _create(seeded_db, assignee_id=user.id)

    todo_notification_service.notify_created(db, todo, user)

    assert _inbox(db) == []
    mock_send.assert_not_called()


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_notify_assignee_changed_only_when_changed_to_partner_or_shared(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, assignee_id=spouse2.id)

    # 담당 그대로 — 조용
    todo_notification_service.notify_assignee_changed(db, todo, spouse2.id, user)
    assert _inbox(db) == []

    # 본인에게 가져옴 — 조용
    todo.assignee_id = user.id
    db.commit()
    todo_notification_service.notify_assignee_changed(db, todo, spouse2.id, user)
    assert _inbox(db) == []

    # 배우자에게 넘김 — 알림
    todo.assignee_id = spouse2.id
    db.commit()
    todo_notification_service.notify_assignee_changed(db, todo, user.id, user)
    assert len(_inbox(db)) == 1
    assert mock_send.call_args.args[0] == "[Nestlio] 할일 담당이 변경되었습니다: 분리수거"


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
@pytest.mark.parametrize("notify,text", [
    (todo_notification_service.notify_completed, "할일을 완료했어요"),
    (todo_notification_service.notify_deleted, "할일을 삭제했어요"),
])
def test_completed_and_deleted_are_inbox_only(mock_connected, mock_send, seeded_db, notify, text):
    db = seeded_db["db"]
    spouse2 = _spouse2(db)
    todo = _create(seeded_db, assignee_id=spouse2.id)

    notify(db, todo, seeded_db["user"])

    assert _inbox(db)[0].detail == f"Spouse 1님이 {text}: 분리수거"
    mock_send.assert_not_called()


@pytest.mark.parametrize("notify", [todo_notification_service.notify_completed, todo_notification_service.notify_deleted])
def test_completed_and_deleted_of_own_todo_are_silent(seeded_db, notify):
    db, user = seeded_db["db"], seeded_db["user"]
    todo = _create(seeded_db, assignee_id=user.id)

    notify(db, todo, user)

    assert _inbox(db) == []


def test_completing_partners_created_todo_assigned_to_self_notifies(seeded_db):
    """배우자가 나에게 맡긴 할일을 끝내면 맡긴 사람이 알아야 한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    spouse2 = _spouse2(db)
    todo = todo_service.create_todo(db, created_by=spouse2.id, title="서류 제출", assignee_id=user.id)

    todo_notification_service.notify_completed(db, todo, user)

    assert len(_inbox(db)) == 1


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_disabled_pref_silences_inbox_and_mail(mock_connected, mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _spouse2(db)
    notification_settings_service.set_prefs(db, {"todo": False}, user.id)
    todo = _create(seeded_db)

    todo_notification_service.notify_created(db, todo, user)
    todo_notification_service.notify_completed(db, todo, user)

    assert _inbox(db) == []
    mock_send.assert_not_called()


@patch("app.services.notification_service.is_connected", return_value=False)
def test_inbox_survives_when_gmail_disconnected(mock_connected, seeded_db):
    db = seeded_db["db"]
    _spouse2(db)
    todo = _create(seeded_db)

    todo_notification_service.notify_created(db, todo, seeded_db["user"])

    assert len(_inbox(db)) == 1


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_inbox_failure_rolls_back_and_still_mails(mock_connected, mock_send, seeded_db):
    db = seeded_db["db"]
    _spouse2(db)
    todo = _create(seeded_db)

    with patch("app.services.todo_notification_service.NotificationRead", side_effect=RuntimeError("db down")):
        todo_notification_service.notify_created(db, todo, seeded_db["user"], now=datetime(2026, 7, 1, 9, 0))

    mock_send.assert_called_once()
    assert _inbox(db) == []
    assert db.get(Todo, todo.id).title == "분리수거"  # 세션을 계속 쓸 수 있다


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_pref_lookup_failure_does_not_raise(mock_connected, mock_send, seeded_db):
    """저장은 이미 끝났으므로 설정 조회 실패가 응답을 500으로 만들면 안 된다."""
    db = seeded_db["db"]
    todo = _create(seeded_db)

    with patch(
        "app.services.todo_notification_service.notification_settings_service.is_enabled",
        side_effect=RuntimeError("db down"),
    ):
        todo_notification_service.notify_created(db, todo, seeded_db["user"])
        todo_notification_service.notify_completed(db, todo, seeded_db["user"])

    assert _inbox(db) == []
