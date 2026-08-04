from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavingsProduct(Base):
    __tablename__ = "savings_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    product_type: Mapped[str] = mapped_column(String(10), default="savings")  # 'savings' | 'investment'
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # growlio(자산관리) 계좌 자동 동기화 연동 — growlio의 AssetAccount.id(UUID 문자열)
    growlio_account_id: Mapped[str | None] = mapped_column(String(36))
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
