from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.savings_product import SavingsProduct


class GoalFundingSource(Base):
    """FinancialGoal과 SavingsProduct의 다대다 연결 행. 목표 하나를 저축상품 여러 개(예: 부부가
    각자 다른 상품으로 모으는 경우)로 채울 수 있게 한다 — FinancialGoal.current_amount는 연결된
    모든 상품의 잔액 합으로 계산된다 (app/models/financial_goal.py 참고)."""

    __tablename__ = "goal_funding_sources"
    __table_args__ = (UniqueConstraint("goal_id", "savings_product_id", name="uq_goal_funding_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("financial_goals.id", ondelete="CASCADE"))
    savings_product_id: Mapped[int] = mapped_column(ForeignKey("savings_products.id", ondelete="CASCADE"))

    savings_product: Mapped["SavingsProduct"] = relationship(lazy="joined")
