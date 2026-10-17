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
    "benchmark_food_warn_pct",
    "benchmark_housing_warn_pct",
    "benchmark_communication_warn_pct",
    "benchmark_transport_warn_pct",
    "benchmark_leisure_warn_pct",
    "benchmark_healthcare_warn_pct",
    "benchmark_education_warn_pct",
    "benchmark_insurance_warn_pct",
)

_PREFIX = "coaching_"


def get_thresholds(db: Session) -> dict[str, float]:
    return user_setting_service.get_overrides(
        db, _PREFIX, THRESHOLD_FIELDS, float, lambda field: getattr(settings, field)
    )


def budget_thresholds(db: Session) -> tuple[float, float]:
    """가구가 설정한 (예산 경고 %, 예산 위험 %). 예산 상태(ok/warn/critical)를 계산하는 모든 곳 —
    계획 화면 라우터와 예산 알림 메일 — 이 같은 값을 쓰도록 한 곳에서 꺼낸다(알림만 env 기본값을
    쓰면 화면은 "정상"인데 "주의" 메일이 오는 식으로 어긋난다)."""
    thresholds = get_thresholds(db)
    return thresholds["budget_warn_pct"], thresholds["budget_critical_pct"]


def set_thresholds(db: Session, values: dict[str, float], updated_by: uuid.UUID) -> dict[str, float]:
    user_setting_service.set_overrides(db, _PREFIX, THRESHOLD_FIELDS, values, updated_by)
    return get_thresholds(db)
