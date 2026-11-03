import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.schemas.common import bounded_str
from app.schemas.user import UserOut

TodoFrequency = Literal["once", "weekly", "monthly", "yearly"]
TodoStatus = Literal["open", "done"]


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    memo: str | None = None
    due_date: date | None = None
    frequency: TodoFrequency
    creator: UserOut
    # 담당자 - None이면 공동(두 사람 모두 담당)
    assignee: UserOut | None = None
    completed_at: datetime | None = None
    completer: UserOut | None = None
    created_at: datetime


class TodoCreateIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    memo: bounded_str(1000) | None = None
    due_date: date | None = None
    frequency: TodoFrequency = "once"
    assignee_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _recurring_needs_due_date(self):
        if self.frequency != "once" and self.due_date is None:
            raise ValueError("반복 할일에는 기한이 필요합니다.")
        return self


class TodoUpdateIn(TodoCreateIn):
    pass


class TodoCompleteIn(BaseModel):
    completed: bool
