from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    year_month: Mapped[str] = mapped_column(String(7), unique=True)  # 'YYYY-MM'
    snapshot_date: Mapped[date] = mapped_column(Date)
    accounts_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    savings_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    loans_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    net_worth: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
