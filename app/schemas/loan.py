import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

RepaymentMethod = Literal["equal_payment", "equal_principal", "bullet", "grace_period", "other"]

_YEAR_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def _validate_year_month(value: str | None) -> str | None:
    if value is not None and not _YEAR_MONTH_RE.match(value):
        raise ValueError("origination_year_month must be in YYYY-MM format")
    return value


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
    growlio_account_id: str | None = None
    auto_sync_enabled: bool = False
    last_synced_at: datetime | None = None


class LoanCreateIn(BaseModel):
    name: str
    balance: Decimal = Decimal("0")
    monthly_payment: Decimal = Decimal("0")
    origination_year_month: str | None = None
    term_months: int | None = None
    interest_rate: Decimal | None = None
    repayment_method: RepaymentMethod | None = None

    _validate_origination_year_month = field_validator("origination_year_month")(_validate_year_month)


class LoanUpdateIn(BaseModel):
    name: str
    balance: Decimal
    monthly_payment: Decimal
    origination_year_month: str | None
    term_months: int | None
    interest_rate: Decimal | None
    repayment_method: RepaymentMethod | None

    _validate_origination_year_month = field_validator("origination_year_month")(_validate_year_month)
