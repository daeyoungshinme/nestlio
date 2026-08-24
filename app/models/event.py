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
    # 담당자 - None이면 "공동"(두 사람 모두 담당). 계좌/저축상품 등의 owner_user_id와 달리 접근 제어용이
    # 아니라 귀속 표시용이며, 구글 캘린더에는 대응 개념이 없어 동기화하지 않는다.
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # dismissed_at과 동일한 "nullable timestamp = 상태 마커" 패턴 - 채워지면 완료.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # users 테이블을 참조하는 FK가 두 개(created_by/assignee_id)라 SQLAlchemy가 자동으로 어느 쪽인지
    # 추론하지 못한다 - 두 관계 모두 foreign_keys를 명시해야 한다.
    creator: Mapped["User"] = relationship(foreign_keys=[created_by], lazy="joined")
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id], lazy="joined")
