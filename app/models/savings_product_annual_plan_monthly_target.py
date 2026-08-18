from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavingsProductAnnualPlanMonthlyTarget(Base):
    """SavingsProductAnnualPlan 하나를 월별 목표금액으로 쪼갠 행. AnnualPlanItemMonthlyTarget과 동일
    구조 — 실적(achieved_amount)은 여기 두지 않고 Transaction.savings_product_id 연결 거래에서 라이브
    집계한다(savings_product_service.actuals_for_month/actuals_for_year)."""

    __tablename__ = "savings_product_annual_plan_monthly_targets"
    __table_args__ = (
        UniqueConstraint("plan_id", "year_month", name="uq_savings_product_annual_plan_monthly_target_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("savings_product_annual_plans.id", ondelete="CASCADE"))
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
