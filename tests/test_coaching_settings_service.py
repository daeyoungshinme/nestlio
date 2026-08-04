from app.config import settings
from app.services import coaching_settings_service


def test_get_thresholds_falls_back_to_env_defaults_when_unset(seeded_db):
    db = seeded_db["db"]

    thresholds = coaching_settings_service.get_thresholds(db)

    assert thresholds["savings_rate_warn"] == settings.savings_rate_warn
    assert thresholds["budget_critical_pct"] == settings.budget_critical_pct


def test_set_thresholds_overrides_and_persists(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = coaching_settings_service.set_thresholds(db, {"savings_rate_warn": 25.0}, user.id)

    assert result["savings_rate_warn"] == 25.0
    # unset fields keep falling back to env defaults
    assert result["savings_rate_critical"] == settings.savings_rate_critical
    # a fresh read reflects the persisted override
    assert coaching_settings_service.get_thresholds(db)["savings_rate_warn"] == 25.0


def test_set_thresholds_ignores_unknown_fields(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    coaching_settings_service.set_thresholds(db, {"not_a_real_field": 1.0}, user.id)

    thresholds = coaching_settings_service.get_thresholds(db)
    assert "not_a_real_field" not in thresholds
