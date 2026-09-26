"""notification_inbox_service — 목표 응원(send_goal_cheer)의 저장 형태."""

from datetime import datetime

import pytest

from app.models.notification_log import NotificationLog
from app.models.notification_reaction import NotificationReaction
from app.services import notification_inbox_service


def test_send_goal_cheer_key_fits_column_even_with_microseconds(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    now = datetime(2026, 9, 26, 14, 32, 26, 123456)

    log_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="💪", message=None, now=now
    )

    log = db.get(NotificationLog, log_id)
    # String(20) 컬럼 — 마이크로초까지 붙이면 26자라 Postgres가 거부한다.
    assert log.year_month == "2026-09-26T14:32:26"
    assert (log.notif_type, log.related_type, log.related_id) == ("goal_cheer", "goal", 7)


def test_send_goal_cheer_trims_message_and_treats_blank_as_none(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    long_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🎉", message="  " + "가" * 300 + "  "
    )
    blank_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🎉", message="   "
    )

    reactions = {r.notification_log_id: r for r in db.query(NotificationReaction).all()}
    assert reactions[long_id].message == "가" * 200
    assert reactions[blank_id].message is None
    assert db.get(NotificationLog, blank_id).detail == 'Spouse 1님이 "내집마련" 목표에 🎉 응원을 보냈어요'


def test_send_goal_cheer_rejects_unknown_emoji(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with pytest.raises(notification_inbox_service.InvalidReactionError):
        notification_inbox_service.send_goal_cheer(
            db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🙂", message=None
        )
