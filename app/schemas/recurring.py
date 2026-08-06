from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.category import CategoryOut


def _validate_days_of_month(days: list[int] | None) -> list[int] | None:
    if days is None:
        return None
    if not days:
        raise ValueError("days_of_month은 비어 있을 수 없습니다.")
    if any(d < 1 or d > 31 for d in days):
        raise ValueError("days_of_month은 1~31 사이여야 합니다.")
    if len(set(days)) != len(days):
        raise ValueError("days_of_month에 중복된 날짜가 있습니다.")
    return days


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category_id: int
    amount: Decimal
    type: Literal["income", "expense"] = "expense"
    frequency: Literal["weekly", "monthly", "yearly"]
    day_of_month: int | None = None
    days_of_month: list[int] | None = None
    start_date: date
    end_date: date | None = None
    reminder_days_before: int
    next_due_date: date
    is_active: bool
    category: CategoryOut


class RecurringListOut(BaseModel):
    items: list[RecurringOut]
    upcoming: list[RecurringOut]


class RecurringCreateIn(BaseModel):
    name: str
    category_id: int
    amount: Decimal
    type: Literal["income", "expense"] = "expense"
    frequency: Literal["weekly", "monthly", "yearly"]
    days_of_month: list[int] | None = None
    start_date: date
    end_date: date | None = None
    reminder_days_before: int = 3

    _validate_days_of_month = field_validator("days_of_month")(_validate_days_of_month)


class RecurringUpdateIn(BaseModel):
    name: str | None = None
    category_id: int | None = None
    amount: Decimal | None = None
    type: Literal["income", "expense"] | None = None
    frequency: Literal["weekly", "monthly", "yearly"] | None = None
    days_of_month: list[int] | None = None
    start_date: date | None = None
    end_date: date | None = None
    reminder_days_before: int | None = None

    _validate_days_of_month = field_validator("days_of_month")(_validate_days_of_month)


class RunNowResultOut(BaseModel):
    created_count: int
