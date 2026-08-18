from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnnualSavingsGoalMonthlyTarget(Base):
    """AnnualSavingsGoal(가구 공동 연간 저축목표) 하나를 1~12월로 쪼갠 월별 목표금액.
    AnnualPlanItemMonthlyTarget과 동일하게 achieved_amount 컬럼이 없다 — 달성률은 저장된 행이
    아니라 가계 전체 현금흐름에서 매번 계산한다(annual_savings_goal_service.compute_progress)."""

    __tablename__ = "annual_savings_goal_monthly_targets"
    __table_args__ = (
        UniqueConstraint("goal_id", "year_month", name="uq_annual_savings_goal_monthly_target_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("annual_savings_goals.id", ondelete="CASCADE"))
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
