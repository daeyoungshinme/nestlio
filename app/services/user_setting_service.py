import logging
import uuid
from collections.abc import Callable, Iterable

from sqlalchemy.orm import Session

from app.models.user_setting import UserSetting

logger = logging.getLogger(__name__)


def get_shared_setting(db: Session, key: str, default: str | None = None) -> str | None:
    """Settings like the emergency-fund balance are shared household state, not
    per-spouse — key는 가구 전체에서 unique(uq_user_settings_key)라 행은 많아야 하나다."""
    row = db.query(UserSetting).filter(UserSetting.key == key).first()
    return row.value if row else default


def get_shared_settings(db: Session, keys: list[str]) -> dict[str, str]:
    """Batched get_shared_setting() for multiple keys in a single query. Keys with no
    saved row are simply absent from the result."""
    rows = db.query(UserSetting).filter(UserSetting.key.in_(keys)).all()
    return {row.key: row.value for row in rows}


def set_shared_setting(db: Session, key: str, value: str, user_id: uuid.UUID) -> None:
    set_shared_settings(db, {key: value}, user_id)


def set_shared_settings(db: Session, values: dict[str, str], user_id: uuid.UUID) -> None:
    """여러 키를 한 번의 조회 + 한 번의 커밋으로 저장한다 — 설정 화면 저장(코칭 임계값 ~25개 등)이
    키마다 커밋하면 중간 실패 시 일부만 저장돼 warn < critical 같은 짝이 깨진다."""
    if not values:
        return
    existing = {row.key: row for row in db.query(UserSetting).filter(UserSetting.key.in_(list(values))).all()}
    for key, value in values.items():
        row = existing.get(key)
        if row is None:
            db.add(UserSetting(user_id=user_id, key=key, value=value))
        else:
            row.value = value
            row.user_id = user_id  # 마지막으로 저장한 사람(행은 key당 하나라 소유자가 아니다)
    db.commit()


def get_overrides[T](
    db: Session, prefix: str, fields: Iterable[str], parse: Callable[[str], T], default: Callable[[str], T]
) -> dict[str, T]:
    """부부가 설정 화면에서 바꾼 값(키 = prefix + field)이 있으면 그 값, 없으면 default(field)(대개 app.config 기본값).
    코칭 임계값·보험 적정 기준이 같은 방식이다. 손상된 행(수기 편집·오래된 데이터) 때문에 대시보드·설정 화면이
    500이 나지 않게 파싱 실패도 기본값으로 폴백한다."""
    fields = list(fields)
    saved = get_shared_settings(db, [prefix + field for field in fields])
    result: dict[str, T] = {}
    for field in fields:
        raw = saved.get(prefix + field)
        if raw is None:
            result[field] = default(field)
            continue
        try:
            result[field] = parse(raw)
        except (TypeError, ValueError, ArithmeticError):  # Decimal은 InvalidOperation(ArithmeticError)
            logger.warning("setting %s%s has invalid value %r; using default", prefix, field, raw)
            result[field] = default(field)
    return result


def set_overrides(db: Session, prefix: str, fields: Iterable[str], values: dict, updated_by: uuid.UUID) -> None:
    """get_overrides의 저장 짝 — fields에 든 키만, 한 번의 커밋으로."""
    set_shared_settings(db, {prefix + field: str(values[field]) for field in fields if field in values}, updated_by)
