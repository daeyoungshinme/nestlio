from decimal import Decimal

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
