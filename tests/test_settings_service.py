from decimal import Decimal

from app.constants.insurance import TARGETED_COVERAGES
from app.schemas.settings import SettingsOut
from app.services import (
    coaching_settings_service,
    couple_photo_service,
    insurance_target_service,
    notification_settings_service,
    settings_service,
)


def test_build_settings_out_matches_schema_and_defaults(seeded_db, monkeypatch):
    db, user = seeded_db["db"], seeded_db["user"]
    monkeypatch.setattr(couple_photo_service.settings, "supabase_service_role_key", "")

    out = settings_service.build_settings_out(db, user.id)

    assert set(out) == set(SettingsOut.model_fields)
    SettingsOut.model_validate(out)
    assert out["google_connected"] is False
    assert out["couple_photo_url"] is None
    assert out["notify_emails"] == [user.email]
    assert out["coaching_thresholds"] == coaching_settings_service.get_thresholds(db)


def test_build_settings_out_reflects_saved_overrides(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    coverage = TARGETED_COVERAGES[0]
    notif_type = next(iter(notification_settings_service.get_prefs(db)))
    coaching_settings_service.set_thresholds(db, {"savings_rate_warn": 25.0}, user.id)
    insurance_target_service.set_targets(db, {coverage: Decimal("12345678")}, user.id)
    notification_settings_service.set_prefs(db, {notif_type: False}, user.id)
    notification_settings_service.set_recipients(db, ["a@example.com"], user.id)

    out = settings_service.build_settings_out(db, user.id)

    assert out["coaching_thresholds"]["savings_rate_warn"] == 25.0
    assert out["insurance_targets"][coverage] == Decimal("12345678")
    assert out["notification_prefs"][notif_type] is False
    assert out["notify_emails"] == ["a@example.com"]
