import uuid

from sqlalchemy.orm import Session

from app.models.user_setting import UserSetting


def get_shared_setting(db: Session, key: str, default: str | None = None) -> str | None:
    """Settings like the emergency-fund balance are shared household state, not
    per-spouse - any row with this key (regardless of who last saved it) applies."""
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
            row.user_id = user_id
    db.commit()
