from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.recurring import RecurringOut
from app.schemas.user import UserOut

EventFrequency = Literal["once", "weekly", "monthly"]


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None = None
    location: str | None = None
    all_day: bool
    start_at: datetime
    end_at: datetime | None = None
    frequency: EventFrequency
    recurrence_end_date: date | None = None
    reminder_minutes_before: int | None = None
    creator: UserOut
    # 반복 일정에서 이번 조회 범위에 해당하는 실제 발생 시각(단일 일정은 start_at과 동일)
    occurrence_start: datetime


class EventListOut(BaseModel):
    items: list[EventOut]
    # 이번 조회 범위 내 예정된 고정지출(RecurringExpense.next_due_date) — 지출 계획을 캘린더에서
    # 함께 볼 수 있도록 하는 읽기 전용 마커. 일정(Event)과 달리 생성/수정/삭제는 고정지출 화면에서만 가능.
    recurring_due: list[RecurringOut]


class EventCreateIn(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    all_day: bool = False
    start_at: datetime
    end_at: datetime | None = None
    frequency: EventFrequency = "once"
    recurrence_end_date: date | None = None
    reminder_minutes_before: int | None = None


class EventUpdateIn(EventCreateIn):
    pass
