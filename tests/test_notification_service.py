from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.user import User
from app.services import cashflow_plan_service, challenge_service, goal_service, notification_service


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_weekly_summary_sent_once_per_week(mock_send, mock_connected, seeded_db):
    db = seeded_db["db"]
    anchor = date(2026, 7, 29)

    first = notification_service.send_weekly_summary(db, today=anchor)
    second = notification_service.send_weekly_summary(db, today=anchor)  # same week, should skip

    assert first is True
    assert second is False
    assert mock_send.call_count == 1


@patch("app.services.notification_service.is_connected", return_value=False)
@patch("app.services.notification_service.gmail_service.send_email")
def test_weekly_summary_logs_even_when_google_not_connected(mock_send, mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    sent = notification_service.send_weekly_summary(db, today=date(2026, 7, 29))

    assert sent is True
    mock_send.assert_not_called()
    [log] = notification_service.list_notifications(db, user.id)
    assert log["notif_type"] == "email_weekly"


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_monthly_summary_sent_once_per_month(mock_send, mock_connected, seeded_db):
    db = seeded_db["db"]
    anchor = date(2026, 8, 3)  # summarizes July

    first = notification_service.send_monthly_summary(db, today=anchor)
    second = notification_service.send_monthly_summary(db, today=date(2026, 8, 20))  # still July's summary period

    assert first is True
    assert second is False
    assert mock_send.call_count == 1


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_threshold_alert_fires_once_per_status_per_month(mock_send, mock_connected, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    from app.services import transaction_service

    ym = "2026-07"
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, food.name, Decimal("100000"), 0, ym, user.id, category_id=food.id
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("95000"), date(2026, 7, 10))

    sent_first = notification_service.check_and_alert_budget_threshold(db, food.id, ym)
    sent_again = notification_service.check_and_alert_budget_threshold(db, food.id, ym)

    assert sent_first is True
    assert sent_again is False  # still 'warn' status - already alerted
    assert mock_send.call_count == 1

    # crossing into 'critical' should fire a *new* alert (different status = different dedupe key)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 15))
    sent_critical = notification_service.check_and_alert_budget_threshold(db, food.id, ym)

    assert sent_critical is True
    assert mock_send.call_count == 2


@patch("app.services.notification_service.is_connected", return_value=False)
@patch("app.services.notification_service.gmail_service.send_email")
def test_threshold_alert_logs_even_when_google_not_connected(mock_send, mock_connected, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    from app.services import transaction_service

    ym = "2026-07"
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, food.name, Decimal("100000"), 0, ym, user.id, category_id=food.id
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("95000"), date(2026, 7, 10))

    sent = notification_service.check_and_alert_budget_threshold(db, food.id, ym)

    assert sent is True
    mock_send.assert_not_called()
    [log] = notification_service.list_notifications(db, user.id)
    assert log["notif_type"] == "threshold_alert"


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_goal_milestone_fires_once_per_milestone(mock_send, mock_connected, seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("1000000"), Decimal("100000"), Decimal("250000"))  # 25%

    sent_first = notification_service.check_and_celebrate_goal_milestone(db, goal.id)
    sent_again = notification_service.check_and_celebrate_goal_milestone(db, goal.id)  # still 25% - already celebrated

    assert sent_first is True
    assert sent_again is False
    assert mock_send.call_count == 1

    # progress advances past 50% - a *new* celebration fires (different milestone = different dedupe key)
    goal_service.update_goal(db, goal.id, 1, "내집마련", 40, Decimal("1000000"), Decimal("100000"), Decimal("600000"))
    sent_next = notification_service.check_and_celebrate_goal_milestone(db, goal.id)

    assert sent_next is True
    assert mock_send.call_count == 2


@patch("app.services.notification_service.gmail_service.send_email")
def test_goal_milestone_skips_when_no_milestone_reached(mock_send, seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("1000000"), Decimal("100000"), Decimal("100000"))  # 10%

    sent = notification_service.check_and_celebrate_goal_milestone(db, goal.id)

    assert sent is False
    mock_send.assert_not_called()


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_goal_milestone_jumping_past_multiple_milestones_sends_only_highest(mock_send, mock_connected, seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("1000000"), Decimal("100000"), Decimal("1000000"))  # 100%

    sent = notification_service.check_and_celebrate_goal_milestone(db, goal.id)

    assert sent is True
    assert mock_send.call_count == 1
    assert "100%" in mock_send.call_args.args[0]


@patch("app.services.notification_service.is_connected", return_value=False)
@patch("app.services.notification_service.gmail_service.send_email")
def test_goal_milestone_logs_even_when_google_not_connected(mock_send, mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("1000000"), Decimal("100000"), Decimal("250000"))  # 25%

    sent = notification_service.check_and_celebrate_goal_milestone(db, goal.id)

    assert sent is True
    mock_send.assert_not_called()
    [log] = notification_service.list_notifications(db, user.id)
    assert log["notif_type"] == "goal_milestone"


def test_check_all_goal_milestones_counts_only_newly_celebrated(seeded_db):
    db = seeded_db["db"]
    goal_service.create_goal(db, 1, "목표1", 40, Decimal("1000000"), Decimal("100000"), Decimal("300000"))  # 30%
    goal_service.create_goal(db, 2, "목표2", 40, Decimal("1000000"), Decimal("100000"), Decimal("0"))  # 0%

    with patch("app.services.notification_service.gmail_service.send_email"):
        sent = notification_service.check_all_goal_milestones(db)
        sent_again = notification_service.check_all_goal_milestones(db)

    assert sent == 1
    assert sent_again == 0


@patch("app.services.notification_service.gmail_service.send_email")
def test_threshold_alert_skips_categories_without_budget(mock_send, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    from app.services import transaction_service

    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("999999"), date(2026, 7, 10))

    sent = notification_service.check_and_alert_budget_threshold(db, food.id, "2026-07")

    assert sent is False
    mock_send.assert_not_called()


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_challenge_success_celebration_fires_once(mock_send, mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = challenge_service.create_challenge(
        db, user.id, "외식비 줄이기", None, Decimal("300000"), date(2026, 8, 1), date(2026, 8, 31)
    )
    challenge_service.update_progress(db, challenge.id, Decimal("300000"))

    sent_first = notification_service.check_and_celebrate_challenge(db, challenge.id)
    sent_again = notification_service.check_and_celebrate_challenge(db, challenge.id)

    assert sent_first is True
    assert sent_again is False
    assert mock_send.call_count == 1
    assert "외식비 줄이기" in mock_send.call_args.args[0]


@patch("app.services.notification_service.is_connected", return_value=False)
@patch("app.services.notification_service.gmail_service.send_email")
def test_challenge_success_logs_even_when_google_not_connected(mock_send, mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = challenge_service.create_challenge(
        db, user.id, "외식비 줄이기", None, Decimal("300000"), date(2026, 8, 1), date(2026, 8, 31)
    )
    challenge_service.update_progress(db, challenge.id, Decimal("300000"))

    sent = notification_service.check_and_celebrate_challenge(db, challenge.id)

    assert sent is True
    mock_send.assert_not_called()
    [log] = notification_service.list_notifications(db, user.id)
    assert log["notif_type"] == "challenge_success"


@patch("app.services.notification_service.gmail_service.send_email")
def test_challenge_success_celebration_skips_while_active(mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = challenge_service.create_challenge(
        db, user.id, "외식비 줄이기", None, Decimal("300000"), date(2026, 8, 1), date(2026, 8, 31)
    )
    challenge_service.update_progress(db, challenge.id, Decimal("150000"))

    sent = notification_service.check_and_celebrate_challenge(db, challenge.id)

    assert sent is False
    mock_send.assert_not_called()


def _second_user(db) -> User:
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)
    return spouse


@patch("app.services.notification_service.gmail_service.send_email")
def test_list_notifications_reflects_read_state_independently_per_user(mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _second_user(db)
    notification_service.send_weekly_summary(db, today=date(2026, 7, 29))

    [log] = notification_service.list_notifications(db, user.id)
    assert log["is_read"] is False
    assert notification_service.unread_count(db, user.id) == 1

    notification_service.mark_read(db, user.id, log["id"], now=datetime(2026, 7, 29, 12, 0))

    [log_after] = notification_service.list_notifications(db, user.id)
    assert log_after["is_read"] is True
    assert notification_service.unread_count(db, user.id) == 0

    # the other spouse's read state is unaffected
    [spouse_view] = notification_service.list_notifications(db, spouse.id)
    assert spouse_view["is_read"] is False
    assert notification_service.unread_count(db, spouse.id) == 1


@patch("app.services.notification_service.gmail_service.send_email")
def test_mark_read_is_idempotent(mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    notification_service.send_weekly_summary(db, today=date(2026, 7, 29))
    [log] = notification_service.list_notifications(db, user.id)

    notification_service.mark_read(db, user.id, log["id"])
    notification_service.mark_read(db, user.id, log["id"])  # should not raise / double-insert

    assert notification_service.unread_count(db, user.id) == 0


def test_mark_read_unknown_id_raises(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with pytest.raises(notification_service.NotificationNotFoundError):
        notification_service.mark_read(db, user.id, 999999)


@patch("app.services.notification_service.gmail_service.send_email")
def test_mark_all_read(mock_send, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    notification_service.send_weekly_summary(db, today=date(2026, 7, 29))
    notification_service.send_monthly_summary(db, today=date(2026, 8, 3))

    marked = notification_service.mark_all_read(db, user.id)
    marked_again = notification_service.mark_all_read(db, user.id)

    assert marked == 2
    assert marked_again == 0
    assert notification_service.unread_count(db, user.id) == 0
