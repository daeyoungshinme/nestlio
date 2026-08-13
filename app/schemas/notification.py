from datetime import datetime

from pydantic import BaseModel, ConfigDict


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


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class MarkAllReadOut(BaseModel):
    marked: int
