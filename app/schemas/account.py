from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    account_type: Literal["bank", "cash", "card"]
    initial_balance: Decimal
    is_active: bool
    sort_order: int
    growlio_account_id: str | None = None


class AccountWithBalanceOut(BaseModel):
    account: AccountOut
    balance: Decimal


class AccountCreateIn(BaseModel):
    name: str
    account_type: Literal["bank", "cash", "card"]
    initial_balance: Decimal = Decimal("0")


class AccountUpdateIn(BaseModel):
    name: str
    account_type: Literal["bank", "cash", "card"]
    current_balance: Decimal


class AccountGrowlioImportIn(BaseModel):
    growlio_account_ids: list[str]
