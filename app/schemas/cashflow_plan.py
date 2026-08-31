import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

CashflowSection = Literal["income", "fixed", "variable", "irregular"]


class CashflowPlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None
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
    # 연간계획 월별 금액이 이번 달 CashflowPlanItem이 없을 때 자동으로 채워 넣은(아직 저장 안 된) 항목이면 true.
    # 저장하면(id가 생기면) 다시 조회해도 false로 바뀐다 — cashflow_plan_service.list_items_with_annual_fallback 참고.
    from_annual_plan: bool = False
    # 가상 폴백 항목(from_annual_plan=true)은 원본 AnnualPlanItem.id — 같은 카테고리에 연간계획 항목이 여러
    # 개 있을 때 프론트엔드가 React key로 구분할 유일한 값이 이것뿐이다. 폴백을 수정/저장해 승격시키면 이 값이
    # 실제 행의 annual_plan_item_id 컬럼에 저장되어(cashflow_plan_service.upsert_item) 승격 후에도 계속
    # 채워진 채로 조회된다 — 연간계획 항목의 이름이 나중에 바뀌어도 이 값으로 원본과의 연결을 유지한다.
    annual_plan_item_id: int | None = None


class CashflowPlanItemUpsertIn(BaseModel):
    id: int | None = None
    section: CashflowSection
    year_month: str
    owner_user_id: uuid.UUID | None = None
    name: str
    amount: Decimal
    category_id: int | None = None
    sort_order: int = 0
    # 연간계획 폴백 항목(CashflowPlanItemOut.annual_plan_item_id)을 수정/저장해 승격시킬 때 프론트엔드가
    # 그대로 실어 보낸다 — cashflow_plan_service.upsert_item이 실제 행에 이 값을 저장해 원본 AnnualPlanItem과의
    # 연결을 유지한다.
    annual_plan_item_id: int | None = None


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
    year_month: str


class CashflowPlanCopyResultOut(BaseModel):
    copied: int


class CashflowPlanLinkRecurringIn(BaseModel):
    recurring_expense_id: int
