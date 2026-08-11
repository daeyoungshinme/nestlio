from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    origination_year_month: Mapped[str | None] = mapped_column(String(7), nullable=True)  # 'YYYY-MM'
    term_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    repayment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # growlio(자산관리) 부동산 담보대출 자동 동기화 연동 — growlio의 AssetAccount.id(UUID 문자열).
    # SavingsProduct와 동일한 값을 공유해 부동산 자산과 짝을 맞춘다(app/services/real_estate_service.py).
    growlio_account_id: Mapped[str | None] = mapped_column(String(36))
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
