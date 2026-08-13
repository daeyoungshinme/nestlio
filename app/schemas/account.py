import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.growlio import GrowlioImportIn


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    account_type: Literal["bank", "cash", "card"]
    initial_balance: Decimal
    is_active: bool
    sort_order: int
    growlio_account_id: str | None = None
    last_synced_at: datetime | None = None
    owner_user_id: uuid.UUID | None = None


class AccountWithBalanceOut(BaseModel):
    account: AccountOut
    balance: Decimal


class AccountCreateIn(BaseModel):
    name: str
    account_type: Literal["bank", "cash", "card"]
    initial_balance: Decimal = Decimal("0")
    owner_user_id: uuid.UUID | None = None


class AccountUpdateIn(BaseModel):
    name: str
    account_type: Literal["bank", "cash", "card"]
    current_balance: Decimal
    owner_user_id: uuid.UUID | None = None


AccountGrowlioImportIn = GrowlioImportIn
