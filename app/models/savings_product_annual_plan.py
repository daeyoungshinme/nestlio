from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavingsProductAnnualPlan(Base):
    """저축/투자 상품(SavingsProduct) 하나의 특정 연도 계획 — AnnualPlanItem(수입/지출)과 동일한
    패턴이지만 이름/카테고리/섹션 대신 product_id로 스코프한다. SavingsProduct는 연도 구분 없이
    영속하는 엔티티라 연도별로 이 행이 따로 생긴다(product_id, year) unique. 상품이 이 계획을 아직
    설정하지 않은 달/연도는 savings_product_service.compute_plan_summary/compute_annual_plan_summary가
    SavingsProduct.monthly_saving_amount로 폴백한다."""

    __tablename__ = "savings_product_annual_plans"
    __table_args__ = (UniqueConstraint("product_id", "year", name="uq_savings_product_annual_plan_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("savings_products.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    start_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    end_month: Mapped[str] = mapped_column(String(7))
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    monthly_targets: Mapped[list["SavingsProductAnnualPlanMonthlyTarget"]] = relationship(
        cascade="all, delete-orphan", order_by="SavingsProductAnnualPlanMonthlyTarget.year_month"
    )
