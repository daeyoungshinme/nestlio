import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import KrwAmount, YearMonth

CashflowSection = Literal["income", "fixed", "variable", "irregular"]


class CashflowPlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int  # AnnualPlanItem.id — 이번 달 계획은 연간계획의 한 달 단면이다
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
    # 이 항목이 이번 달 말고도 다른 달에 금액을 갖는 연간계획 항목이면 true — 여기서 바꾸는 금액은
    # 이번 달에만 적용된다(cashflow_plan_service.MonthPlanItem).
    spans_multiple_months: bool = False


class CashflowPlanItemUpsertIn(BaseModel):
    id: int | None = None
    section: CashflowSection
    year_month: YearMonth
    owner_user_id: uuid.UUID | None = None
    name: str
    amount: KrwAmount
    category_id: int | None = None
    sort_order: int = 0


class CashflowPlanItemSplitIn(BaseModel):
    section: CashflowSection
    owner_user_id: uuid.UUID | None = None
    name: str
    total_amount: KrwAmount
    start_year_month: YearMonth
    category_id: int | None = None
    sort_order: int = 0


class CashflowPlanSplitResultOut(BaseModel):
    created: int


class CashflowPlanSectionSummaryOut(BaseModel):
    planned: Decimal
    actual: Decimal | None
    pct: float | None
    status: Literal["ok", "warn", "critical"] | None
    suggested_amount: Decimal | None = None


class CashflowPlanSummaryOut(BaseModel):
    income: CashflowPlanSectionSummaryOut
    fixed: CashflowPlanSectionSummaryOut
    variable: CashflowPlanSectionSummaryOut
    irregular: CashflowPlanSectionSummaryOut
    expense_total: Decimal
    available: Decimal


class CategoryBudgetRowOut(BaseModel):
    """카테고리별 이번 달 예산(카테고리 태깅한 계획 항목 합계) 대비 실적. 구 `/budgets` 응답을
    `/cashflow-plan` 응답에 흡수한 것 — 별도 라우터/쿼리 없이 계획 화면 한 번에 내려준다."""

    category_id: int
    name: str
    type: Literal["fixed", "variable", "irregular"]
    color: str
    budget: Decimal
    actual: Decimal
    pct: float
    status: Literal["ok", "warn", "critical"]
    suggested_amount: Decimal | None = None


class CashflowPlanListOut(BaseModel):
    year_month: str
    prev_month: str
    next_month: str
    items: list[CashflowPlanItemOut]
    summary: CashflowPlanSummaryOut
    category_budgets: list[CategoryBudgetRowOut]


class CashflowPlanCopyIn(BaseModel):
    year_month: YearMonth


class CashflowPlanCopyResultOut(BaseModel):
    copied: int


class CashflowPlanLinkRecurringIn(BaseModel):
    recurring_expense_id: int
    # 응답으로 돌려줄 이번 달 계획의 월 — 항목 자체는 여러 달에 걸칠 수 있어 요청자가 보던 달을 받는다.
    year_month: YearMonth
