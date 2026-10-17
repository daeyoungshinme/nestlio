import uuid
from datetime import datetime
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas.common import bounded_str

# notification_log.notif_type(String(30))에 기록되는 값. 새 알림 종류를 추가하면 여기와 프론트 NotifType(types/index.ts)·
# 알림함 제목(Header.tsx NOTIF_TYPE_LABEL)을 함께 고친다. "other"는 출력 폴백 전용.
NotifType = Literal[
    "email_weekly",
    "email_monthly",
    "threshold_alert",
    "goal_milestone",
    "challenge_success",
    "event_reminder",
    "goal_cheer",
    "savings_pace_reminder",
    "partner_saving",
    "google_reauth",
    "other",
]
_NOTIF_TYPES = frozenset(get_args(NotifType))


def _unknown_notif_type_to_other(v: object) -> object:
    return "other" if isinstance(v, str) and v not in _NOTIF_TYPES else v


# 출력 전용 폴백(schemas/transaction.py PaymentMethodOut 패턴) — 종류를 없애도 남은 로그 행 때문에 알림함이 500이 나지 않게.
NotifTypeOut = Annotated[NotifType, BeforeValidator(_unknown_notif_type_to_other)]


class NotificationReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    display_name: str
    emoji: str
    message: str | None
    created_at: datetime


class NotificationReactionIn(BaseModel):
    emoji: bounded_str(8)
    message: bounded_str(200) | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    notif_type: NotifTypeOut
    related_type: str | None
    related_id: int | None
    year_month: str | None
    sent_at: datetime
    detail: str | None
    is_read: bool
    reactions: list[NotificationReactionOut] = []


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class MarkAllReadOut(BaseModel):
    marked: int
