import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

CashflowSection = Literal["income", "fixed", "variable", "irregular"]


class CashflowPlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section: CashflowSection
    year_month: str
    owner_user_id: uuid.UUID | None
    name: str
    amount: Decimal
    category_id: int | None = None
    category_name: str | None = None
    category_color: str | None = None
    sort_order: int
    installment_no: int | None = None
    installment_total: int | None = None
    installment_total_amount: Decimal | None = None
    recurring_expense_id: int | None = None
    recurring_active: bool | None = None


class CashflowPlanItemUpsertIn(BaseModel):
    id: int | None = None
    section: CashflowSection
    year_month: str
    owner_user_id: uuid.UUID | None = None
    name: str
    amount: Decimal
    category_id: int | None = None
    sort_order: int = 0


class CashflowPlanItemSplitIn(BaseModel):
    section: CashflowSection
    owner_user_id: uuid.UUID | None = None
    name: str
    total_amount: Decimal
    start_year_month: str
    category_id: int | None = None
    sort_order: int = 0


class CashflowPlanSplitResultOut(BaseModel):
    created: int


class CashflowPlanSectionSummaryOut(BaseModel):
    planned: Decimal
    actual: Decimal | None
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None


class CashflowPlanSummaryOut(BaseModel):
    income: CashflowPlanSectionSummaryOut
    fixed: CashflowPlanSectionSummaryOut
    variable: CashflowPlanSectionSummaryOut
    irregular: CashflowPlanSectionSummaryOut
    expense_total: Decimal
    available: Decimal


class CashflowPlanListOut(BaseModel):
    year_month: str
    prev_month: str
    next_month: str
    items: list[CashflowPlanItemOut]
    summary: CashflowPlanSummaryOut


class CashflowPlanCopyIn(BaseModel):
    year_month: str


class CashflowPlanCopyResultOut(BaseModel):
    copied: int


class CashflowPlanLinkRecurringIn(BaseModel):
    recurring_expense_id: int
