from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.goal_funding_source import GoalFundingSource


class FinancialGoal(Base):
    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(100))
    target_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # 실제 컬럼명은 그대로 current_amount(하위호환) — 연동된 저축상품(funding_sources)이 하나라도
    # 있으면 이 수동 입력값 대신 연동 상품들의 잔액 합이 진행률 계산에 쓰인다. 아래 current_amount 참고.
    manual_current_amount: Mapped[Decimal] = mapped_column("current_amount", Numeric(14, 2), default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    funding_sources: Mapped[list["GoalFundingSource"]] = relationship(
        lazy="joined", order_by="GoalFundingSource.id", cascade="all, delete-orphan"
    )

    @property
    def current_amount(self) -> Decimal:
        """연동된 저축상품이 하나 이상 있으면 그 잔액 합을, 없으면 수동 입력값을 반환한다."""
        if self.funding_sources:
            return sum((fs.savings_product.current_balance for fs in self.funding_sources), Decimal("0"))
        return self.manual_current_amount

    @property
    def funding_source_ids(self) -> list[int]:
        return [fs.savings_product_id for fs in self.funding_sources]

    @property
    def funding_source_names(self) -> list[str]:
        return [fs.savings_product.name for fs in self.funding_sources]

    @property
    def progress_pct(self) -> Decimal:
        if not self.required_amount:
            return Decimal("0")
        return min(self.current_amount / self.required_amount * 100, Decimal("100"))
