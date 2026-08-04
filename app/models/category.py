from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(10), default="expense")  # 'income' | 'expense'
    type: Mapped[str] = mapped_column(String(10))  # 'fixed' | 'variable' | 'irregular'
    color: Mapped[str] = mapped_column(String(20), default="#888888")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_discretionary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_debt: Mapped[bool] = mapped_column(Boolean, default=False)
    is_savings: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
