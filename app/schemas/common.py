import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class TotalsOut(BaseModel):
    income: Decimal
    expense: Decimal
    fixed: Decimal
    variable: Decimal
    irregular: Decimal
    savings: Decimal


class UserTotalsOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    income: Decimal
    expense: Decimal
    savings: Decimal


class CategoryAmountOut(BaseModel):
    category_id: int
    name: str
    color: str
    type: Literal["fixed", "variable", "irregular"]
    amount: Decimal


class TrendRowOut(BaseModel):
    year_month: str
    income: Decimal
    expense: Decimal
    fixed: Decimal
    variable: Decimal
    irregular: Decimal
