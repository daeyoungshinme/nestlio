import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.category import Category


class AnnualPlanItem(Base):
    """연간계획 항목 — CashflowPlanItem(월간)의 연간 버전. year_month 하나 대신 연도 전체를
    monthly_targets 관계로 쪼갠다. section은 CashflowSection과 동일 값('income'|'fixed'|
    'variable'|'irregular') — 저축·투자는 여기 포함하지 않고 기존 SavingsProduct를 그대로 쓴다."""

    __tablename__ = "annual_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(10))  # 'income' | 'fixed' | 'variable' | 'irregular'
    start_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM' — 이 항목의 월별 입력 적용 기간 시작
    end_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM' — 적용 기간 종료 (둘 다 포함)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # income 섹션에서만 사용 (부부 구분)
    name: Mapped[str] = mapped_column(String(100))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    category: Mapped["Category | None"] = relationship(lazy="joined")
    monthly_targets: Mapped[list["AnnualPlanItemMonthlyTarget"]] = relationship(
        cascade="all, delete-orphan", order_by="AnnualPlanItemMonthlyTarget.year_month"
    )
