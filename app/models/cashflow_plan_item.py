import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.category import Category
from app.models.recurring_expense import RecurringExpense


class CashflowPlanItem(Base):
    """가구 단위의 현금흐름 계획(예산 설정) 한 행. 실제 거래내역과는 무관한 목표/계획 값이다.
    category_id가 채워진 행은 실제 카테고리에 태깅된 계획 항목으로, budget_service.budget_vs_actual이
    같은 카테고리를 태깅한 항목들의 합을 그 카테고리의 예산 상한으로 집계한다. category_id가 NULL인 행은
    특정 카테고리에 매이지 않는 자유 텍스트 계획 항목이다. 둘 다 cashflow_plan_service.list_items가 함께 조회하며
    섹션 합계(compute_summary)에도 구분 없이 합산된다."""

    __tablename__ = "cashflow_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(10))  # 'income' | 'fixed' | 'variable' | 'irregular'
    year_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM'
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # income 섹션에서만 사용 (부부 구분)
    name: Mapped[str] = mapped_column(String(100))
    # DB 컬럼명은 그대로 amount/category_id(하위호환) — recurring_expense_id로 연동되면 아래 amount/category_id
    # 프로퍼티가 이 값 대신 연동된 RecurringExpense의 현재 값을 반환한다(read-through). 연동이 끊기면(SET NULL)
    # 다시 이 값이 쓰이므로, 연동 중에도 own_amount/own_category_id는 최근 연동 값으로 계속 백필된다
    # (link_recurring, migrations/versions에서 백필하는 드리프트 정리 마이그레이션 참고).
    own_amount: Mapped[Decimal] = mapped_column("amount", Numeric(12, 2), default=0)
    own_category_id: Mapped[int | None] = mapped_column("category_id", ForeignKey("categories.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 12개월 분할(할부) 등록으로 생성된 항목만 채워진다. 각 행은 독립적으로 수정/삭제되며
    # 이 값들은 표시용(예: "3/12")일 뿐 생성 이후 그룹 단위 동작에는 쓰이지 않는다.
    installment_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # 수입/고정지출 항목을 반복거래로 등록해 자동으로 가계부에 반영시킬 때만 채워진다.
    recurring_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_expenses.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    own_category: Mapped["Category | None"] = relationship(lazy="joined")
    recurring_expense: Mapped["RecurringExpense | None"] = relationship(lazy="joined")

    @property
    def amount(self) -> Decimal:
        """반복거래에 연동된 항목은 연동된 RecurringExpense의 현재 금액을 그대로 반환한다(read-through)."""
        return self.recurring_expense.amount if self.recurring_expense is not None else self.own_amount

    @property
    def category_id(self) -> int | None:
        return self.recurring_expense.category_id if self.recurring_expense is not None else self.own_category_id

    @property
    def category(self) -> "Category | None":
        return self.recurring_expense.category if self.recurring_expense is not None else self.own_category

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    @property
    def category_color(self) -> str | None:
        return self.category.color if self.category else None

    @property
    def recurring_active(self) -> bool | None:
        return self.recurring_expense.is_active if self.recurring_expense else None
