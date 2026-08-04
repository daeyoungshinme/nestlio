"""Resolves coaching-engine thresholds as household-editable settings, falling back to
the server env defaults (app.config.settings) when no override has been saved yet."""
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.services import user_setting_service

THRESHOLD_FIELDS = (
    "savings_rate_warn",
    "savings_rate_critical",
    "fixed_cost_ratio_warn",
    "fixed_cost_ratio_critical",
    "budget_warn_pct",
    "budget_critical_pct",
    "discretionary_ratio_warn",
    "debt_ratio_warn",
)


def _setting_key(field: str) -> str:
    return f"coaching_{field}"


def get_thresholds(db: Session) -> dict[str, float]:
    saved = user_setting_service.get_shared_settings(db, [_setting_key(field) for field in THRESHOLD_FIELDS])
    result = {}
    for field in THRESHOLD_FIELDS:
        raw = saved.get(_setting_key(field))
        result[field] = float(raw) if raw is not None else getattr(settings, field)
    return result


def set_thresholds(db: Session, values: dict[str, float], updated_by: uuid.UUID) -> dict[str, float]:
    for field in THRESHOLD_FIELDS:
        if field not in values:
            continue
        user_setting_service.set_shared_setting(db, _setting_key(field), str(values[field]), updated_by)
    return get_thresholds(db)
