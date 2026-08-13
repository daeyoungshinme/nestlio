"""알림 유형별 발송 on/off 설정 — UserSetting(key/value) 재사용, coaching_settings_service와
동일한 패턴(household 공유 설정, 새 테이블 없음)이다. 저장된 값이 없으면 기본 on(항상 발송하던
기존 동작)으로 취급해 하위호환을 지킨다."""
import uuid

from sqlalchemy.orm import Session

from app.services import user_setting_service

# 'calendar_event'는 모델 주석에는 남아 있지만 실제로 발송하는 코드 경로가 없어(죽은 타입)
# 토글 대상에서 제외한다.
NOTIF_TYPES = (
    "email_weekly",
    "email_monthly",
    "threshold_alert",
    "goal_milestone",
    "challenge_success",
    "event_reminder",
)


def _setting_key(notif_type: str) -> str:
    return f"notif_pref_{notif_type}"


def get_prefs(db: Session) -> dict[str, bool]:
    saved = user_setting_service.get_shared_settings(db, [_setting_key(t) for t in NOTIF_TYPES])
    return {t: saved.get(_setting_key(t), "on") != "off" for t in NOTIF_TYPES}


def is_enabled(db: Session, notif_type: str) -> bool:
    value = user_setting_service.get_shared_setting(db, _setting_key(notif_type))
    return value != "off"


def set_prefs(db: Session, values: dict[str, bool], updated_by: uuid.UUID) -> dict[str, bool]:
    for notif_type in NOTIF_TYPES:
        if notif_type not in values:
            continue
        user_setting_service.set_shared_setting(db, _setting_key(notif_type), "on" if values[notif_type] else "off", updated_by)
    return get_prefs(db)
