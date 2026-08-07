"""Resolves who receives Google-연동 알림 메일: defaults to household members' signup
emails until someone explicitly saves an override list, in which case the saved list
is used from then on (newly-joined spouses are not auto-merged into a saved override)."""
import json
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.services import user_setting_service

NOTIFY_RECIPIENT_EMAILS_KEY = "notify_recipient_emails"
MAX_RECIPIENTS = 5


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
