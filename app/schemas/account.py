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


class AccountWithBalanceOut(BaseModel):
    account: AccountOut
    balance: Decimal


class AccountCreateIn(BaseModel):
    name: str
    account_type: Literal["bank", "cash", "card"]
    initial_balance: Decimal = Decimal("0")
