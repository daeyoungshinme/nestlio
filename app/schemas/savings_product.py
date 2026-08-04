from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class SavingsProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    product_type: Literal["savings", "investment"] = "savings"
    sort_order: int
    is_active: bool
    growlio_account_id: str | None = None
    auto_sync_enabled: bool = False
    last_synced_at: datetime | None = None


class SavingsProductCreateIn(BaseModel):
    name: str
    current_balance: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    product_type: Literal["savings", "investment"] = "savings"


class SavingsProductUpdateIn(BaseModel):
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    product_type: Literal["savings", "investment"]


class SavingsProductGrowlioLinkIn(BaseModel):
    growlio_account_id: str | None
    auto_sync_enabled: bool = False


class GrowlioAccountOut(BaseModel):
    """growlio `/api/v1/external/accounts` 응답을 그대로 전달하는 프록시용 스키마."""

    id: str
    name: str
    asset_type: str
    current_value_krw: float
    as_of: str | None = None
