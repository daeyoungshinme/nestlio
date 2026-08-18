from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnnualPlanItemMonthlyTarget(Base):
    """AnnualPlanItem 하나를 1~12월로 쪼갠 월별 목표금액. GoalMonthlyTarget과 달리 achieved_amount
    컬럼이 없다 — 항목 단위 실적 비교는 하지 않고(월간 CashflowPlanItemRow도 항목별 실적을 보여주지
    않는 것과 동일), 섹션 전체 달성률만 거래내역에서 라이브 집계한다(annual_plan_service.py)."""

    __tablename__ = "annual_plan_item_monthly_targets"
    __table_args__ = (
        UniqueConstraint("item_id", "year_month", name="uq_annual_plan_item_monthly_target_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("annual_plan_items.id", ondelete="CASCADE"))
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
