"""app/config.py의 시동 검증 — 운영에서 필수 설정 누락 시 fail-fast, 임계값 범위/순서 검증."""
import pytest

from app.config import Settings, validate_startup


def _prod_settings(**overrides):
    base = dict(
        app_env="production",
        database_url="postgresql+psycopg2://u:p@host/db",
        supabase_project_url="https://real.supabase.co",
        internal_job_secret="a-real-random-secret",
    )
    base.update(overrides)
    return Settings(**base)


def test_production_raises_on_default_sqlite(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    s = _prod_settings(database_url="sqlite:///./data/app.db")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_startup(s)


def test_production_raises_on_placeholder_secret(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    s = _prod_settings(internal_job_secret="change-me-to-a-random-secret")
    with pytest.raises(RuntimeError, match="INTERNAL_JOB_SECRET"):
        validate_startup(s)


def test_production_ok_when_required_present(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    validate_startup(_prod_settings())  # no raise


def test_render_env_forces_production(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    s = Settings(app_env="development", supabase_project_url="")
    with pytest.raises(RuntimeError):
        validate_startup(s)


def test_development_never_raises(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    validate_startup(Settings(app_env="development", database_url="sqlite:///./data/app.db"))


def test_threshold_range_validation():
    with pytest.raises(ValueError, match="0-100"):
        Settings(budget_warn_pct=900)


def test_threshold_pair_ordering():
    with pytest.raises(ValueError, match="SAVINGS_RATE"):
        Settings(savings_rate_warn=5, savings_rate_critical=10)
    with pytest.raises(ValueError, match="BUDGET"):
        Settings(budget_warn_pct=100, budget_critical_pct=90)
