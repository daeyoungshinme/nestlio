from app.services import notification_prefs_service


def test_get_prefs_defaults_all_on(seeded_db):
    db = seeded_db["db"]
    prefs = notification_prefs_service.get_prefs(db)
    assert set(prefs) == set(notification_prefs_service.NOTIF_TYPES)
    assert all(prefs.values())


def test_is_enabled_defaults_true_for_unsaved_type(seeded_db):
    db = seeded_db["db"]
    assert notification_prefs_service.is_enabled(db, "email_weekly") is True


def test_set_prefs_persists_and_reflects_in_get(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    values = {t: True for t in notification_prefs_service.NOTIF_TYPES}
    values["email_weekly"] = False

    result = notification_prefs_service.set_prefs(db, values, user.id)

    assert result["email_weekly"] is False
    assert result["email_monthly"] is True
    assert notification_prefs_service.get_prefs(db)["email_weekly"] is False
    assert notification_prefs_service.is_enabled(db, "email_weekly") is False


def test_set_prefs_ignores_unknown_keys(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    result = notification_prefs_service.set_prefs(db, {"not_a_real_type": False}, user.id)
    assert all(result.values())
