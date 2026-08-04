import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import User


class Challenge(Base):
    """부부가 함께 세우는 단기 미션(예: '이번 달 외식비 30만원 이하로'). 진행 금액(current_amount)은
    수동 입력이며, 목표 금액에 도달하면 status가 succeeded로 바뀌고 축하 알림이 나간다
    (app/services/notification_service.py::check_and_celebrate_challenge)."""

    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active")  # 'active' | 'succeeded'
    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    created_by: Mapped["User"] = relationship(lazy="joined")

    @property
    def progress_pct(self) -> Decimal:
        if not self.target_amount:
            return Decimal("0")
        return min(self.current_amount / self.target_amount * 100, Decimal("100"))
