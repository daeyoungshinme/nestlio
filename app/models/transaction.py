import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.account import Account
from app.models.category import Category
from app.models.savings_product import SavingsProduct
from app.models.user import User


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    type: Mapped[str] = mapped_column(String(10))  # 'income' | 'expense'
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    transaction_date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    recurring_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_expenses.id"), nullable=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id"), nullable=True, index=True
    )
    savings_product_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "savings_products.id", name="fk_transactions_savings_product_id_savings_products"
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id], lazy="joined")
    owner: Mapped["User | None"] = relationship(foreign_keys=[owner_user_id], lazy="joined")
    category: Mapped["Category"] = relationship(lazy="joined")
    account: Mapped["Account | None"] = relationship(lazy="joined")
    savings_product: Mapped["SavingsProduct | None"] = relationship(lazy="joined")

    # 비영속(트랜잭션 스코프) 플래그 — DB 컬럼이 아니다(그래서 Mapped 애노테이션을 붙이지 않는다).
    # growlio 잔액 반영이 best-effort로 실패했을 때 transaction_service._push_growlio가 True로
    # 세팅하고, 라우터가 이를 읽어 응답 헤더(X-Growlio-Sync-Warning)로만 알린다.
    # TransactionOut 스키마에는 포함하지 않는다.
    growlio_sync_failed = False
