"""Resolves coaching-engine thresholds as household-editable settings, falling back to
the server env defaults (app.config.settings) when no override has been saved yet."""
import logging
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
    "benchmark_food_warn_pct",
    "benchmark_housing_warn_pct",
    "benchmark_communication_warn_pct",
    "benchmark_transport_warn_pct",
    "benchmark_leisure_warn_pct",
    "benchmark_healthcare_warn_pct",
    "benchmark_education_warn_pct",
    "benchmark_insurance_warn_pct",
)


logger = logging.getLogger(__name__)


def _setting_key(field: str) -> str:
    return f"coaching_{field}"


def get_thresholds(db: Session) -> dict[str, float]:
    saved = user_setting_service.get_shared_settings(db, [_setting_key(field) for field in THRESHOLD_FIELDS])
    result = {}
    for field in THRESHOLD_FIELDS:
        raw = saved.get(_setting_key(field))
        default = getattr(settings, field)
        if raw is None:
            result[field] = default
            continue
        try:
            result[field] = float(raw)
        except (TypeError, ValueError):
            # 손상된 user_settings 행(수기 편집·오래된 데이터) 때문에 대시보드·설정 화면 전체가
            # 500이 나지 않도록 env 기본값으로 폴백한다.
            logger.warning("coaching threshold %s has non-numeric value %r; using default %s", field, raw, default)
            result[field] = default
    return result


def set_thresholds(db: Session, values: dict[str, float], updated_by: uuid.UUID) -> dict[str, float]:
    for field in THRESHOLD_FIELDS:
        if field not in values:
            continue
        user_setting_service.set_shared_setting(db, _setting_key(field), str(values[field]), updated_by)
    return get_thresholds(db)
