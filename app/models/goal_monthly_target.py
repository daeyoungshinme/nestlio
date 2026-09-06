from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GoalMonthlyTarget(Base):
    """kind="goal"이면서 미연동(funding_sources 없음)인 장기목표의 월별 계획 — 목표 기간 안의 각
    달에 대해 목표금액(target_amount)과 실제 저축한 금액(achieved_amount, 매달 사용자가 직접
    입력 또는 연동된 거래내역에서 자동 계산)을 따로 관리한다. 미연동이면서 monthly_targets이 있는
    FinancialGoal의 required_amount/current_amount는 이 행들의 합으로 파생된다
    (app/services/goal_service.py 참고)."""

    __tablename__ = "goal_monthly_targets"
    __table_args__ = (UniqueConstraint("goal_id", "year_month", name="uq_goal_monthly_target_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("financial_goals.id", ondelete="CASCADE"))
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    achieved_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
