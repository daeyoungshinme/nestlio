from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

RepaymentMethod = Literal["equal_payment", "equal_principal", "bullet", "other"]


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    balance: Decimal
    monthly_payment: Decimal
    origination_year_month: str | None
    term_months: int | None
    interest_rate: Decimal | None
    repayment_method: RepaymentMethod | None
    sort_order: int
    is_active: bool


class LoanCreateIn(BaseModel):
    name: str
    balance: Decimal = Decimal("0")
    monthly_payment: Decimal = Decimal("0")
    origination_year_month: str | None = None
    term_months: int | None = None
    interest_rate: Decimal | None = None
    repayment_method: RepaymentMethod | None = None


class LoanUpdateIn(BaseModel):
    name: str
    balance: Decimal
    monthly_payment: Decimal
    origination_year_month: str | None
    term_months: int | None
    interest_rate: Decimal | None
    repayment_method: RepaymentMethod | None
