import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.growlio import GrowlioImportIn, GrowlioSyncAllOut


class SavingsProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    product_type: Literal["savings", "investment", "real_estate", "emergency_fund"] = "savings"
    principal_amount: Decimal | None = None
    return_amount: Decimal | None = None
    return_rate_pct: Decimal | None = None
    sort_order: int
    is_active: bool
    growlio_account_id: str | None = None
    auto_sync_enabled: bool = False
    last_synced_at: datetime | None = None
    owner_user_id: uuid.UUID | None = None
    linked_goal_id: int | None = None
    linked_goal_name: str | None = None
    monthly_saving_amount_synced: bool = False


class SavingsProductCreateIn(BaseModel):
    name: str
    current_balance: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    product_type: Literal["savings", "investment", "real_estate", "emergency_fund"] = "savings"
    principal_amount: Decimal | None = None
    owner_user_id: uuid.UUID | None = None


class SavingsProductUpdateIn(BaseModel):
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    product_type: Literal["savings", "investment", "real_estate", "emergency_fund"]
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
    suggested_monthly_saving_amount: Decimal | None = None


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


class SavingsProductAnnualPlanMonthlyTargetOut(BaseModel):
    year_month: str
    target_amount: Decimal


class SavingsProductAnnualPlanMonthlyTargetIn(BaseModel):
    year_month: str
    target_amount: Decimal


class SavingsProductAnnualPlanDetailOut(BaseModel):
    product_id: int
    year: int
    start_month: str
    end_month: str
    monthly_targets: list[SavingsProductAnnualPlanMonthlyTargetOut]


class SavingsProductAnnualPlanUpsertIn(BaseModel):
    year: int
    start_month: str
    end_month: str
    monthly_targets: list[SavingsProductAnnualPlanMonthlyTargetIn]


class SavingsProductGrowlioLinkIn(BaseModel):
    growlio_account_id: str | None
    auto_sync_enabled: bool = False


SavingsProductGrowlioImportIn = GrowlioImportIn
SavingsProductSyncAllOut = GrowlioSyncAllOut


class GrowlioAccountOut(BaseModel):
    """growlio `/api/v1/external/accounts` 응답을 그대로 전달하는 프록시용 스키마.

    growlio 자체가 도메인 전체에서 float를 쓰므로(정밀도 손실은 이미 growlio 쪽에서 발생) 여기서
    Decimal로 감싸도 복구되지 않는다 — float 유지가 의도된 설계다. 이 값을 nestlio 자체 Decimal
    컬럼(SavingsProduct.current_balance 등)에 저장할 때는 반드시 `Decimal(str(x))`로 재변환한다."""

    id: str
    name: str
    asset_type: str
    current_value_krw: float
    as_of: str | None = None
