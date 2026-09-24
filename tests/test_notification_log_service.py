"""notification_log_service — 예약 요약 메일/예산 경고/목표 달성 알림의 중복 발송을 막는 dedup 키 규칙."""

from app.services import notification_log_service


def test_already_sent_matches_type_period_and_target(seeded_db):
    db = seeded_db["db"]
    notification_log_service.log_sent(db, "threshold_alert", "2026-07", related_id=3)

    assert notification_log_service.already_sent(db, "threshold_alert", "2026-07", related_id=3)
    assert not notification_log_service.already_sent(db, "threshold_alert", "2026-08", related_id=3)
    assert not notification_log_service.already_sent(db, "threshold_alert", "2026-07", related_id=4)
    assert not notification_log_service.already_sent(db, "email_monthly", "2026-07", related_id=3)


def test_already_sent_without_target_does_not_match_targeted_rows(seeded_db):
    db = seeded_db["db"]
    notification_log_service.log_sent(db, "threshold_alert", "2026-07", related_id=3)
    assert not notification_log_service.already_sent(db, "threshold_alert", "2026-07")

    notification_log_service.log_sent(db, "email_weekly", "2026-07-06")
    assert notification_log_service.already_sent(db, "email_weekly", "2026-07-06")


def test_log_sent_defaults_related_type_and_truncates_detail(seeded_db):
    from app.models.notification_log import NotificationLog

    db = seeded_db["db"]
    notification_log_service.log_sent(db, "threshold_alert", "2026-07", related_id=3, detail="x" * 600)
    notification_log_service.log_sent(db, "email_monthly", "2026-07")

    rows = {r.notif_type: r for r in db.query(NotificationLog).all()}
    assert rows["threshold_alert"].related_type == "category"
    assert len(rows["threshold_alert"].detail) == 500
    assert rows["email_monthly"].related_type is None
