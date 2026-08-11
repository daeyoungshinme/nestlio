from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

FundingSourceType = Literal["savings_product", "account", "loan"]


class FundingSourceIn(BaseModel):
    type: FundingSourceType
    id: int


class FundingSourceOut(BaseModel):
    type: FundingSourceType
    id: int
    name: str
    amount: Decimal


class FinancialGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    priority: int
    name: str
    target_age: int | None
    target_date: date | None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal
    progress_pct: Decimal
    sort_order: int
    funding_sources: list[FundingSourceOut] = []
    months_remaining: int | None = None
    suggested_monthly_amount: Decimal | None = None


class FinancialGoalCreateIn(BaseModel):
    priority: int = 1
    name: str
    target_age: int | None = None
    target_date: date | None = None
    required_amount: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []


class FinancialGoalUpdateIn(BaseModel):
    priority: int
    name: str
    target_age: int | None
    target_date: date | None = None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []
