"""보험 적정 가입금액 기준 — 정액 보장별(암진단·뇌혈관·심장·입원일당·사망·후유장해) 합계가 이 기준을 크게 넘으면
보험 점검이 감액 후보로 본다. 부부가 설정에서 바꾼 값이 우선이고, 없으면 app.config.settings의 기본값을 쓴다
(user_setting_service.get_overrides — coaching_settings_service와 같은 방식). 0은 "기준 없음"."""
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.insurance import TARGETED_COVERAGES
from app.services import user_setting_service

_PREFIX = "insurance_target_"


def default_target(coverage: str) -> Decimal:
    return Decimal(getattr(settings, _PREFIX + coverage))


def get_targets(db: Session) -> dict[str, Decimal]:
    return user_setting_service.get_overrides(db, _PREFIX, TARGETED_COVERAGES, Decimal, default_target)


def set_targets(db: Session, values: dict[str, Decimal], updated_by: uuid.UUID) -> dict[str, Decimal]:
    user_setting_service.set_overrides(db, _PREFIX, TARGETED_COVERAGES, values, updated_by)
    return get_targets(db)
