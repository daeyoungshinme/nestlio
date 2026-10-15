"""보험 적정 가입금액 기준 — 정액 보장별(암진단·뇌혈관·심장·입원일당·사망·후유장해) 합계가 이 기준을 크게 넘으면
보험 점검이 감액 후보로 본다. 부부가 설정에서 바꾼 값이 우선이고, 없으면 app.config.settings의 기본값을 쓴다
(coaching_settings_service와 같은 패턴). 0은 "기준 없음"."""
import logging
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.insurance import TARGETED_COVERAGES
from app.services import user_setting_service

logger = logging.getLogger(__name__)


def _setting_key(coverage: str) -> str:
    return f"insurance_target_{coverage}"


def default_target(coverage: str) -> Decimal:
    return Decimal(getattr(settings, _setting_key(coverage)))


def get_targets(db: Session) -> dict[str, Decimal]:
    saved = user_setting_service.get_shared_settings(db, [_setting_key(c) for c in TARGETED_COVERAGES])
    result = {}
    for coverage in TARGETED_COVERAGES:
        raw = saved.get(_setting_key(coverage))
        if raw is None:
            result[coverage] = default_target(coverage)
            continue
        try:
            result[coverage] = Decimal(raw)
        except (InvalidOperation, TypeError):
            # 손상된 행 때문에 설정·절감 점검 화면이 500이 나지 않게 기본값으로 폴백한다.
            logger.warning("insurance target %s has invalid value %r; using default", coverage, raw)
            result[coverage] = default_target(coverage)
    return result


def set_targets(db: Session, values: dict[str, Decimal], updated_by: uuid.UUID) -> dict[str, Decimal]:
    user_setting_service.set_shared_settings(
        db, {_setting_key(c): str(values[c]) for c in TARGETED_COVERAGES if c in values}, updated_by
    )
    return get_targets(db)
