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
    values = {t: True for t in notification_settings_service.NOTIF_TYPES}
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
