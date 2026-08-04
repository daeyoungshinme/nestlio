from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.savings_product import SavingsProduct


class FinancialGoal(Base):
    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(100))
    target_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # 실제 컬럼명은 그대로 current_amount(하위호환) — primary_savings_product_id로 연동되면
    # 이 수동 입력값 대신 연동 상품의 잔액이 진행률 계산에 쓰인다. 아래 current_amount 프로퍼티 참고.
    manual_current_amount: Mapped[Decimal] = mapped_column("current_amount", Numeric(14, 2), default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    primary_savings_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("savings_products.id"), nullable=True
    )
    primary_savings_product: Mapped["SavingsProduct | None"] = relationship(lazy="joined")

    @property
    def current_amount(self) -> Decimal:
        """연동된 저축상품이 있으면 그 잔액을, 없으면 수동 입력값을 반환한다."""
        if self.primary_savings_product is not None:
            return self.primary_savings_product.current_balance
        return self.manual_current_amount

    @property
    def primary_savings_product_name(self) -> str | None:
        return self.primary_savings_product.name if self.primary_savings_product else None

    @property
    def progress_pct(self) -> Decimal:
        if not self.required_amount:
            return Decimal("0")
        return min(self.current_amount / self.required_amount * 100, Decimal("100"))
