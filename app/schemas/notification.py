import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    display_name: str
    emoji: str
    message: str | None
    created_at: datetime


class NotificationReactionIn(BaseModel):
    emoji: str
    message: str | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    notif_type: str
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
