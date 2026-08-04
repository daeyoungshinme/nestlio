import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ChallengeCreateIn(BaseModel):
    title: str
    description: str | None = None
    target_amount: Decimal
    start_date: date
    end_date: date


class ChallengeUpdateIn(ChallengeCreateIn):
    pass


class ChallengeProgressIn(BaseModel):
    current_amount: Decimal


class ChallengeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    target_amount: Decimal
    current_amount: Decimal
    progress_pct: Decimal
    start_date: date
    end_date: date
    status: Literal["active", "succeeded"]
    effective_status: Literal["active", "succeeded", "expired"]
    created_by_id: uuid.UUID
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
