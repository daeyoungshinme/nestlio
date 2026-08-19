from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import KrwAmount


class AnnualSavingsGoalMonthlyTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year_month: str
    target_amount: Decimal


class AnnualSavingsGoalMonthlyTargetIn(BaseModel):
    year_month: str
    target_amount: KrwAmount


class AnnualSavingsGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    target_amount_krw: Decimal
    monthly_target_krw: Decimal | None
    monthly_targets: list[AnnualSavingsGoalMonthlyTargetOut]
    updated_at: datetime
    net_savings_ytd: Decimal
    annual_achievement_pct: Decimal
    current_month_savings: Decimal
    monthly_achievement_pct: Decimal | None


class AnnualSavingsGoalUpsertIn(BaseModel):
    """target_amount_krw는 더 이상 직접 입력받지 않는다 — monthly_targets(1~12월) 합계로
    서비스가 파생시킨다(app/services/annual_savings_goal_service.py::upsert_goal)."""

    monthly_targets: list[AnnualSavingsGoalMonthlyTargetIn]


class AnnualSavingsGoalSuggestionOut(BaseModel):
    """월/연 목표 제안값 — 저장된 목표와 별개의 순수 조회 데이터. 두 가지 기준을 함께 내려준다:
    가구 현금흐름(최근 3개월 평균 실제 저축액) 기준과, 현재 등록된 재무목표들의 월 저축금액
    합계 기준(goal_based_*)."""

    suggested_monthly_target_krw: Decimal
    suggested_annual_target_krw: Decimal
    goal_based_monthly_target_krw: Decimal
    goal_based_annual_target_krw: Decimal


class AnnualSavingsGoalExternalOut(BaseModel):
    """growlio 등 외부 서비스에 노출하는 읽기전용 형태 — target 값만 담는다. 진행률/달성률은
    각 서비스가 자기 자신의 거래내역으로 독립 계산하므로(app/services/annual_savings_goal_service.py
    ::compute_progress는 nestlio 화면 전용) 여기서는 내려주지 않는다. monthly_target_krw는
    AnnualSavingsGoal.monthly_target_krw property(target_amount_krw/12)에서 하위호환으로 채워진다."""

    model_config = ConfigDict(from_attributes=True)

    year: int
    target_amount_krw: Decimal
    monthly_target_krw: Decimal | None
