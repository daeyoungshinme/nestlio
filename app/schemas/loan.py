import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import KrwAmount, KrwBalance, Pct, YearMonth, bounded_str

RepaymentMethod = Literal["equal_payment", "equal_principal", "bullet", "grace_period", "other"]

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
    owner_user_id: uuid.UUID | None = None


class LoanCreateIn(BaseModel):
    name: bounded_str(100)
    balance: KrwBalance = Decimal("0")
    monthly_payment: KrwAmount = Decimal("0")
    origination_year_month: YearMonth | None = None
    term_months: int | None = None
    interest_rate: Pct | None = None
    repayment_method: RepaymentMethod | None = None
    owner_user_id: uuid.UUID | None = None


class LoanUpdateIn(BaseModel):
    name: bounded_str(100)
    balance: KrwBalance
    monthly_payment: KrwAmount
    origination_year_month: YearMonth | None
    term_months: int | None
    interest_rate: Pct | None
    repayment_method: RepaymentMethod | None
    owner_user_id: uuid.UUID | None = None

