import uuid

from sqlalchemy.orm import Session

from app.models.user_setting import UserSetting

EMERGENCY_FUND_BALANCE_KEY = "emergency_fund_balance"


def get_shared_setting(db: Session, key: str, default: str | None = None) -> str | None:
    """Settings like the emergency-fund balance are shared household state, not
    per-spouse - any row with this key (regardless of who last saved it) applies."""
    row = db.query(UserSetting).filter(UserSetting.key == key).first()
    return row.value if row else default


def set_shared_setting(db: Session, key: str, value: str, user_id: uuid.UUID) -> None:
    row = db.query(UserSetting).filter(UserSetting.key == key).first()
    if row is None:
        db.add(UserSetting(user_id=user_id, key=key, value=value))
    else:
        row.value = value
        row.user_id = user_id
    db.commit()
