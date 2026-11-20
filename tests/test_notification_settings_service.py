from app.models.user import User
from app.services import notification_settings_service


def _second_user(db) -> User:
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)
    return spouse


def test_get_prefs_defaults_all_on(seeded_db):
    db = seeded_db["db"]
    prefs = notification_settings_service.get_prefs(db)
    assert set(prefs) == set(notification_settings_service.NOTIF_TYPES)
    assert all(prefs.values())


def test_is_enabled_defaults_true_for_unsaved_type(seeded_db):
    db = seeded_db["db"]
    assert notification_settings_service.is_enabled(db, "email_weekly") is True


def test_set_prefs_persists_and_reflects_in_get(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    values = dict.fromkeys(notification_settings_service.NOTIF_TYPES, True)
    values["email_weekly"] = False

    result = notification_settings_service.set_prefs(db, values, user.id)

    assert result["email_weekly"] is False
    assert result["email_monthly"] is True
    assert notification_settings_service.get_prefs(db)["email_weekly"] is False
    assert notification_settings_service.is_enabled(db, "email_weekly") is False


def test_set_prefs_ignores_unknown_keys(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    result = notification_settings_service.set_prefs(db, {"not_a_real_type": False}, user.id)
    assert all(result.values())


def test_get_recipients_defaults_to_signup_email_when_unset(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    assert notification_settings_service.get_recipients(db) == [user.email]


def test_get_recipients_includes_second_user_once_joined(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _second_user(db)

    assert notification_settings_service.get_recipients(db) == [user.email, spouse.email]


def test_set_recipients_overrides_and_persists(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = notification_settings_service.set_recipients(db, ["a@example.com", "b@example.com"], user.id)

    assert result == ["a@example.com", "b@example.com"]
    assert notification_settings_service.get_recipients(db) == ["a@example.com", "b@example.com"]


def test_set_recipients_override_does_not_auto_merge_new_spouse_email(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    notification_settings_service.set_recipients(db, ["only-this@example.com"], user.id)
    _second_user(db)

    assert notification_settings_service.get_recipients(db) == ["only-this@example.com"]


def test_get_recipients_default_excludes_removed_spouse(seeded_db):
    """제거된(소프트 삭제된) 배우자는 users 행이 남아 있어도 기본 수신자에서 빠져야 한다."""
    from datetime import datetime

    from app.services import user_service

    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _second_user(db)
    user_service.remove_user(db, target=spouse, requested_by=user, now=datetime(2026, 9, 1, 9, 0))

    assert notification_settings_service.get_recipients(db) == [user.email]


def test_get_recipients_drops_removed_spouse_from_saved_list(seeded_db):
    from datetime import datetime

    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _second_user(db)
    notification_settings_service.set_recipients(db, [user.email, spouse.email], user.id)
    spouse.removed_at = datetime(2026, 7, 1)
    db.commit()

    assert notification_settings_service.get_recipients(db) == [user.email]


def test_get_recipients_falls_back_on_corrupted_value(seeded_db):
    from app.services import user_setting_service

    db, user = seeded_db["db"], seeded_db["user"]
    user_setting_service.set_shared_setting(
        db, notification_settings_service.NOTIFY_RECIPIENT_EMAILS_KEY, "{not json", user.id
    )
    assert notification_settings_service.get_recipients(db) == [user.email]


def test_recipients_excluding_ignores_email_case(seeded_db):
    # 설정 화면에 대문자를 섞어 저장해도 행위자 본인에게 "방금 내가 한 일" 메일이 가지 않아야 한다.
    db, user = seeded_db["db"], seeded_db["user"]
    notification_settings_service.set_recipients(db, [user.email.upper(), "spouse2@example.com"], user.id)

    assert notification_settings_service.recipients_excluding(db, user.id) == ["spouse2@example.com"]
