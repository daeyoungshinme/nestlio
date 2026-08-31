import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import KrwAmount

FundingSourceType = Literal["savings_product", "account", "loan"]
GoalKind = Literal["goal", "challenge"]


class FundingSourceIn(BaseModel):
    type: FundingSourceType
    id: int


class FundingSourceOut(BaseModel):
    type: FundingSourceType
    id: int
    name: str
    amount: Decimal


class GoalMonthlyTargetIn(BaseModel):
    year_month: str
    target_amount: KrwAmount


class GoalMonthlyTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year_month: str
    target_amount: Decimal
    achieved_amount: Decimal
    is_achieved: bool
    # True면 achieved_amount가 연동된 저축상품/계좌의 거래내역에서 매번 다시 계산된 값이라
    # 수정할 수 없다(goal_service.compute_linked_monthly_achieved 참고) — kind="goal"이면서
    # funding_sources가 있는 목표만 해당. False면 사용자가 PATCH .../monthly-targets/{year_month}로
    # 직접 입력한 값 그대로다.
    is_auto_computed: bool = False


class GoalMonthlyTargetAchievedIn(BaseModel):
    achieved_amount: Decimal


class FinancialGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: GoalKind = "goal"
    priority: int
    name: str
    description: str | None = None
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
    # 현재 월 저축금액 속도로 목표금액 도달 예상 달("YYYY-MM"). 월 저축금액이 0이고 미달성이면 None.
    eta_year_month: str | None = None
    # 예상 도달 달이 목표일보다 얼마나 이른지(+)/늦은지(-). 목표일이나 ETA가 없으면 None.
    ahead_behind_months: int | None = None
    # 아래 5개는 kind="challenge"(단기 부부 챌린지)일 때만 채워진다.
    start_date: date | None = None
    status: Literal["active", "succeeded"] = "active"
    effective_status: Literal["active", "succeeded", "expired"] | None = None
    created_by_id: uuid.UUID | None = None
    completed_at: datetime | None = None
    # kind="goal"이면서 미연동(funding_sources 없음)일 때 월별 계획을 쓰면 채워진다.
    monthly_targets: list[GoalMonthlyTargetOut] = []


class FinancialGoalCreateIn(BaseModel):
    kind: GoalKind = "goal"
    priority: int = 1
    name: str
    description: str | None = None
    target_age: int | None = None
    target_date: date | None = None
    required_amount: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []
    start_date: date | None = None
    monthly_targets: list[GoalMonthlyTargetIn] | None = None


class FinancialGoalUpdateIn(BaseModel):
    priority: int
    name: str
    description: str | None = None
    target_age: int | None
    target_date: date | None = None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal = Decimal("0")
    funding_sources: list[FundingSourceIn] = []
    start_date: date | None = None
    monthly_targets: list[GoalMonthlyTargetIn] | None = None


class GrowlioGoalSettingsOut(BaseModel):
    """growlio `/api/v1/external/goal` 응답을 그대로 전달하는 프록시용 스키마 — 재무목표
    신규 작성 폼을 미리 채우는 용도. is_configured가 False면 나머지 필드는 모두 None이다.

    growlio 자체가 도메인 전체에서 float를 쓰므로(정밀도 손실은 이미 growlio 쪽에서 발생) 여기서
    Decimal로 감싸도 복구되지 않는다 — float 유지가 의도된 설계다. 이 값으로 FinancialGoal(Decimal
    컬럼)을 생성할 때는 반드시 `Decimal(str(x))`로 재변환한다."""

    is_configured: bool
    goal_amount: float | None = None
    goal_annual_return_pct: float | None = None
    goal_start_date: date | None = None
    goal_initial_amount: float | None = None
    annual_deposit_goal: float | None = None
    annual_dividend_goal: float | None = None
