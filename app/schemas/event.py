import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.common import bounded_str
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
    # 담당자 - None이면 공동(두 사람 모두 담당)
    assignee: UserOut | None = None
    # 반복 일정은 occurrence_start 회차의 완료 시각
    completed_at: datetime | None = None
    # 반복 일정에서 이번 조회 범위에 해당하는 실제 발생 시각(단일 일정은 start_at과 동일)
    occurrence_start: datetime


class EventListOut(BaseModel):
    items: list[EventOut]
    # 이번 조회 범위 내 예정된 고정지출(RecurringExpense.next_due_date) — 지출 계획을 캘린더에서
    # 함께 볼 수 있도록 하는 읽기 전용 마커. 일정(Event)과 달리 생성/수정/삭제는 고정지출 화면에서만 가능.
    recurring_due: list[RecurringOut]


# 리마인더는 최대 7일 전까지 — 화면 선택지도 이 안이다.
REMINDER_MINUTES_MAX = 7 * 24 * 60


class EventCreateIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: bounded_str(1000) | None = None
    location: bounded_str(255) | None = None
    all_day: bool = False
    start_at: datetime
    end_at: datetime | None = None
    frequency: EventFrequency = "once"
    recurrence_end_date: date | None = None
    reminder_minutes_before: Annotated[int, Field(ge=0, le=REMINDER_MINUTES_MAX)] | None = None
    assignee_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _check_order(self):
        if self.end_at is not None and self.end_at < self.start_at:
            raise ValueError("종료 시각은 시작 시각보다 앞설 수 없습니다.")
        if self.recurrence_end_date is not None and self.recurrence_end_date < self.start_at.date():
            raise ValueError("반복 종료일은 시작일보다 앞설 수 없습니다.")
        return self


class EventUpdateIn(EventCreateIn):
    pass


class EventCompleteIn(BaseModel):
    completed: bool
    # 반복 일정은 어느 회차인지 필수. 단건 일정은 무시한다.
    occurrence_date: date | None = None
