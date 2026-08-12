import uuid
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
    product_type: Literal["savings", "investment", "real_estate"] = "savings"
    principal_amount: Decimal | None = None
    return_amount: Decimal | None = None
    return_rate_pct: Decimal | None = None
    sort_order: int
    is_active: bool
    growlio_account_id: str | None = None
    auto_sync_enabled: bool = False
    last_synced_at: datetime | None = None
    owner_user_id: uuid.UUID | None = None


class SavingsProductCreateIn(BaseModel):
    name: str
    current_balance: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    product_type: Literal["savings", "investment", "real_estate"] = "savings"
    principal_amount: Decimal | None = None
    owner_user_id: uuid.UUID | None = None


class SavingsProductUpdateIn(BaseModel):
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    product_type: Literal["savings", "investment", "real_estate"]
    principal_amount: Decimal | None = None
    owner_user_id: uuid.UUID | None = None


class SavingsProductPlanItemOut(BaseModel):
    id: int
    name: str
    product_type: Literal["savings", "investment"]
    planned: Decimal
    actual: Decimal
    pct: float
    status: Literal["ok", "warn", "critical"]


class SavingsProductPlanGroupOut(BaseModel):
    planned: Decimal
    actual: Decimal | None
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None


class SavingsProductPlanListOut(BaseModel):
    year_month: str
    items: list[SavingsProductPlanItemOut]
    savings: SavingsProductPlanGroupOut
    investment: SavingsProductPlanGroupOut


class SavingsProductAnnualPlanItemOut(BaseModel):
    id: int
    name: str
    product_type: Literal["savings", "investment"]
    annual_target: Decimal
    target_to_date: Decimal
    actual: Decimal
    pct: float
    status: Literal["ok", "warn", "critical"]


class SavingsProductAnnualPlanGroupOut(BaseModel):
    annual_target: Decimal
    target_to_date: Decimal
    actual: Decimal | None
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None


class SavingsProductAnnualPlanListOut(BaseModel):
    year: int
    elapsed_months: int
    items: list[SavingsProductAnnualPlanItemOut]
    savings: SavingsProductAnnualPlanGroupOut
    investment: SavingsProductAnnualPlanGroupOut


class SavingsProductGrowlioLinkIn(BaseModel):
    growlio_account_id: str | None
    auto_sync_enabled: bool = False


class SavingsProductGrowlioImportIn(BaseModel):
    growlio_account_ids: list[str]


class GrowlioAccountOut(BaseModel):
    """growlio `/api/v1/external/accounts` 응답을 그대로 전달하는 프록시용 스키마."""

    id: str
    name: str
    asset_type: str
    current_value_krw: float
    as_of: str | None = None
