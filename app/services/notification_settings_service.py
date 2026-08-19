"""알림 관련 설정 두 종류를 함께 다룬다 — 둘 다 UserSetting(key/value) 위의 얇은 get/set
래퍼이고 항상 함께 쓰여 하나의 모듈로 합쳤다.

- 유형별 발송 on/off (NOTIF_TYPES / get_prefs / is_enabled / set_prefs): coaching_settings_service와
  동일한 패턴(household 공유 설정, 새 테이블 없음)이다. 저장된 값이 없으면 기본 on(항상 발송하던
  기존 동작)으로 취급해 하위호환을 지킨다.
- 수신자 목록 (get_recipients / set_recipients): household 구성원 가입 이메일을 기본값으로 쓰다가
  누군가 override 목록을 저장하면 그 이후로는 저장된 목록만 쓴다(새로 합류한 배우자가 저장된
  override에 자동으로 합쳐지지 않는다).
"""
import json
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
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

NOTIFY_RECIPIENT_EMAILS_KEY = "notify_recipient_emails"
MAX_RECIPIENTS = 5


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


def _default_recipients(db: Session) -> list[str]:
    emails = [u.email for u in db.query(User).order_by(User.created_at).all()]
    return emails or [settings.notify_email_to]


def get_recipients(db: Session) -> list[str]:
    saved = user_setting_service.get_shared_setting(db, NOTIFY_RECIPIENT_EMAILS_KEY, None)
    if saved is not None:
        return json.loads(saved)
    return _default_recipients(db)


def set_recipients(db: Session, emails: list[str], updated_by: uuid.UUID) -> list[str]:
    user_setting_service.set_shared_setting(db, NOTIFY_RECIPIENT_EMAILS_KEY, json.dumps(emails), updated_by)
    return get_recipients(db)
