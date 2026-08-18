from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GoalMonthlyTarget(Base):
    """kind="irregular"(기간제 비정기 지출 목표) 전용 — 목표 기간(FinancialGoal.start_date~target_date)
    안의 각 달에 대해 목표금액(target_amount)과 실제 저축한 금액(achieved_amount, 매달 사용자가
    직접 입력)을 따로 관리한다. FinancialGoal.required_amount/current_amount는 이 행들의 target_amount/
    achieved_amount 합으로 파생된다 (app/services/goal_service.py 참고) — 이 테이블에만 실제 값이 있다."""

    __tablename__ = "goal_monthly_targets"
    __table_args__ = (UniqueConstraint("goal_id", "year_month", name="uq_goal_monthly_target_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("financial_goals.id", ondelete="CASCADE"))
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    achieved_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
