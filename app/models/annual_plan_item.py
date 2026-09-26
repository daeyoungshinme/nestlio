import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.category import Category
from app.models.recurring_expense import RecurringExpense


class AnnualPlanItem(Base):
    """현금흐름 계획(수입/고정/변동/비정기)의 **유일한 원본**. 한 항목이 한 해 안의 월별 금액을
    monthly_targets로 갖고, "이번 달 계획" 화면은 그 달 target이 있는 항목들을 그대로 보여준다(별도
    월간 테이블 없음 — 구 CashflowPlanItem은 이 모델로 흡수됐다). "이번 달만" 쓰는 항목은 target이
    한 달만 있는 항목이고, 할부는 남은 달에 target을 나눠 가진 항목 하나다(installment_*).
    section은 'income'|'fixed'|'variable'|'irregular' — 저축·투자는 여기 포함하지 않고
    SavingsProduct(+SavingsProductAnnualPlan)를 그대로 쓴다.

    recurring_expense_id로 반복거래에 연동되면 target이 있는 모든 달의 금액과 카테고리가 연동된
    RecurringExpense의 현재 값으로 read-through된다(`amount_for`/`effective_category*`, SQL 집계는
    plan_targets.effective_* 식). 연동이 끊기면(SET NULL) 다시 저장된 target/category_id가 쓰인다."""

    __tablename__ = "annual_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    section: Mapped[str] = mapped_column(String(10))  # 'income' | 'fixed' | 'variable' | 'irregular'
    start_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM' — 이 항목의 월별 입력 적용 기간 시작
    end_month: Mapped[str] = mapped_column(String(7))  # 'YYYY-MM' — 적용 기간 종료 (둘 다 포함)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # income 섹션에서만 사용 (부부 구분)
    name: Mapped[str] = mapped_column(String(100))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 할부 등록(cashflow_plan_service.split_item_into_months)으로 만든 항목만 채워진다 — 표시용("3/10").
    # 회차는 저장하지 않고 installment_start_month(1회차 달)로부터의 경과 개월로 계산한다(installment_no_for).
    # start_month는 달을 지우거나 앞 달에 금액을 넣을 때 움직이므로 회차 기준으로 쓰면 남은 회차가 전부
    # 재번호된다 — 1회차 달은 등록 시 한 번 정하고 바꾸지 않는다.
    installment_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    installment_start_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    recurring_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "recurring_expenses.id",
            ondelete="SET NULL",
            name="fk_annual_plan_items_recurring_expense_id",
        ),
        nullable=True,
        index=True,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    category: Mapped["Category | None"] = relationship(lazy="joined")
    recurring_expense: Mapped["RecurringExpense | None"] = relationship(lazy="joined")
    monthly_targets: Mapped[list["AnnualPlanItemMonthlyTarget"]] = relationship(
        cascade="all, delete-orphan", order_by="AnnualPlanItemMonthlyTarget.year_month"
    )

    def amount_for(self, target_amount: Decimal) -> Decimal:
        """저장된 월 target 대신 쓸 실제 계획 금액 — 반복거래 연동 시 그 반복거래의 현재 금액."""
        return self.recurring_expense.amount if self.recurring_expense is not None else target_amount

    @property
    def effective_category_id(self) -> int | None:
        return self.recurring_expense.category_id if self.recurring_expense is not None else self.category_id

    @property
    def effective_category(self) -> "Category | None":
        return self.recurring_expense.category if self.recurring_expense is not None else self.category

    @property
    def recurring_active(self) -> bool | None:
        return self.recurring_expense.is_active if self.recurring_expense is not None else None

    def installment_no_for(self, year_month: str) -> int | None:
        if self.installment_total is None:
            return None
        first = self.installment_start_month or self.start_month
        start_y, start_m = int(first[:4]), int(first[5:7])
        y, m = int(year_month[:4]), int(year_month[5:7])
        return (y - start_y) * 12 + (m - start_m) + 1
