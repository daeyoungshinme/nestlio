from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.category import CategoryOut


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category_id: int
    amount: Decimal
    frequency: Literal["weekly", "monthly", "yearly"]
    day_of_month: int | None = None
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
    frequency: Literal["weekly", "monthly", "yearly"]
    start_date: date
    end_date: date | None = None
    reminder_days_before: int = 3


class RecurringUpdateIn(BaseModel):
    name: str | None = None
    category_id: int | None = None
    amount: Decimal | None = None
    frequency: Literal["weekly", "monthly", "yearly"] | None = None
    start_date: date | None = None
    end_date: date | None = None
    reminder_days_before: int | None = None


class RunNowResultOut(BaseModel):
    created_count: int
