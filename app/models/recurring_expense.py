import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.category import Category


class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    type: Mapped[str] = mapped_column(String(10), default="expense")  # 'income' | 'expense'
    frequency: Mapped[str] = mapped_column(String(10))  # 'monthly' | 'weekly' | 'yearly'
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_of_month: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminder_days_before: Mapped[int] = mapped_column(Integer, default=3)
    next_due_date: Mapped[date] = mapped_column(Date)
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    category: Mapped["Category"] = relationship(lazy="joined")
