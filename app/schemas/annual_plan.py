import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.cashflow_plan import CashflowSection


class AnnualPlanItemMonthlyTargetOut(BaseModel):
    year_month: str
    target_amount: Decimal


class AnnualPlanItemMonthlyTargetIn(BaseModel):
    year_month: str
    target_amount: Decimal


class AnnualPlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    section: CashflowSection
    owner_user_id: uuid.UUID | None
    name: str
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    sort_order: int
    updated_at: datetime
    start_month: str
    end_month: str
    annual_target: Decimal
    monthly_targets: list[AnnualPlanItemMonthlyTargetOut]


class AnnualPlanItemUpsertIn(BaseModel):
    id: int | None = None
    year: int
    section: CashflowSection
    owner_user_id: uuid.UUID | None = None
    name: str
    category_id: int | None = None
    sort_order: int = 0
    start_month: str
    end_month: str
    monthly_targets: list[AnnualPlanItemMonthlyTargetIn] = []


class AnnualPlanSectionMonthOut(BaseModel):
    year_month: str
    target_amount: Decimal
    actual: Decimal | None
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None


class AnnualPlanSectionSummaryOut(BaseModel):
    section: CashflowSection
    elapsed_months: int
    annual_target: Decimal
    target_to_date: Decimal
    actual: Decimal
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None
    monthly: list[AnnualPlanSectionMonthOut]


class AnnualPlanSummaryOut(BaseModel):
    income: AnnualPlanSectionSummaryOut
    fixed: AnnualPlanSectionSummaryOut
    variable: AnnualPlanSectionSummaryOut
    irregular: AnnualPlanSectionSummaryOut
    expense_total: Decimal
    available: Decimal


class AnnualPlanListOut(BaseModel):
    year: int
    items: list[AnnualPlanItemOut]
    summary: AnnualPlanSummaryOut


class AnnualCategoryBudgetRowOut(BaseModel):
    category_id: int
    name: str
    type: Literal["fixed", "variable", "irregular"]
    color: str
    budget: Decimal
    actual: Decimal
    pct: float
    status: Literal["ok", "warn", "critical"]
