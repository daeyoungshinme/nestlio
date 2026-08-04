import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.category import Category
from app.models.user import User


class CashflowPlanItem(Base):
    """가구 단위의 현금흐름 계획(예산 설정) 한 행. 실제 거래내역과는 무관한 목표/계획 값이다.
    category_id가 채워진 행은 "카테고리별 예산 상한"(구 Budget 모델이 통합된 것)이고, budget_service가
    다룬다 — 자유 텍스트 계획 항목(category_id NULL)과는 cashflow_plan_service가 필터링해 분리 조회한다."""

    __tablename__ = "cashflow_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(10))  # 'income' | 'fixed' | 'variable' | 'irregular'
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # income 섹션에서만 사용 (부부 구분)
    name: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 12개월 분할(할부) 등록으로 생성된 항목만 채워진다. 각 행은 독립적으로 수정/삭제되며
    # 이 값들은 표시용(예: "3/12")일 뿐 생성 이후 그룹 단위 동작에는 쓰이지 않는다.
    installment_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    owner: Mapped["User | None"] = relationship(foreign_keys=[owner_user_id], lazy="joined")
    category: Mapped["Category | None"] = relationship(lazy="joined")
