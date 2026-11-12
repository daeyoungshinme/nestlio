from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class NetWorthBreakdownOut(BaseModel):
    accounts_total: Decimal
    savings_total: Decimal
    loans_total: Decimal
    net_worth: Decimal


class NetWorthSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year_month: str
    accounts_total: Decimal
    savings_total: Decimal
    loans_total: Decimal
    net_worth: Decimal


class NetWorthOut(BaseModel):
    current: NetWorthBreakdownOut
    history: list[NetWorthSnapshotOut]


class NetWorthGrowlioUnlinkedOut(BaseModel):
    bank_total: Decimal
    investment_total: Decimal
    real_estate_total: Decimal
    real_estate_loan_total: Decimal
    net_total: Decimal
    item_count: int


class GrowlioPushFailedOut(BaseModel):
    """growlio 반영을 자동으로 포기한 저축·투자 입출금 한 건 — 자산 화면 경고에서 다시 보내기 대상."""

    id: int
    product_name: str | None
    transaction_type: Literal["DEPOSIT", "WITHDRAWAL"]
    amount: Decimal
    transaction_date: date
    last_error: str | None


class GrowlioPushRetryOut(BaseModel):
    sent: bool
