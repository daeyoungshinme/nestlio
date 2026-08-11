from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

FundingSourceType = Literal["savings_product", "account", "loan"]


class FundingSourceIn(BaseModel):
    type: FundingSourceType
    id: int


class FundingSourceOut(BaseModel):
    type: FundingSourceType
    id: int
    name: str
    amount: Decimal


class FinancialGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    priority: int
    name: str
    target_age: int | None
    target_date: date | None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal
    progress_pct: Decimal
    sort_order: int
    funding_sources: list[FundingSourceOut] = []
    months_remaining: int | None = None
    suggested_monthly_amount: Decimal | None = None
    # 연동된 투자형 저축상품의 잔액 가중평균 수익률(원금 대비 손익률)과, 그 수익률을 가정해
    # 복리로 계속 불렸을 때 목표금액까지 예상 소요 개월수. 둘 다 투자 연동이 없거나 원금
    # 미입력이면 None — goal_service.compute_weighted_return_rate_pct/
    # compute_projected_months_with_growth 참고. 어디까지나 가정치이므로 프론트에서 항상
    # "가정치" 문구와 함께 노출한다.
    weighted_return_rate_pct: Decimal | None = None
    projected_months_with_growth: int | None = None


class FinancialGoalCreateIn(BaseModel):
    priority: int = 1
    name: str
    target_age: int | None = None
    target_date: date | None = None
    required_amount: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []


class FinancialGoalUpdateIn(BaseModel):
    priority: int
    name: str
    target_age: int | None
    target_date: date | None = None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []


class GrowlioGoalSettingsOut(BaseModel):
    """growlio `/api/v1/external/goal` 응답을 그대로 전달하는 프록시용 스키마 — 재무목표
    신규 작성 폼을 미리 채우는 용도. is_configured가 False면 나머지 필드는 모두 None이다."""

    is_configured: bool
    goal_amount: float | None = None
    goal_annual_return_pct: float | None = None
    goal_start_date: date | None = None
    goal_initial_amount: float | None = None
    annual_deposit_goal: float | None = None
    annual_dividend_goal: float | None = None
