import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import User


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    frequency: Mapped[str] = mapped_column(String(10), default="once")  # 'once' | 'weekly' | 'monthly'
    recurrence_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminder_minutes_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    google_calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="native")  # 'native' | 'google_import'
    # google_import 일정을 로컬 목록에서 숨길 때 채워지는 타임스탬프(하드 삭제 아님) - User.removed_at과
    # 동일한 소프트 삭제 패턴. 채워진 행은 import_from_google 재실행 시 되살아나지 않는다.
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    creator: Mapped["User"] = relationship(lazy="joined")
