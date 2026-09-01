import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationRead(Base):
    """NotificationLog(가구 단위 로그) 한 건을 특정 유저가 읽었다는 표시. 배우자별로 읽음 상태가 독립적이다."""

    __tablename__ = "notification_read"
    __table_args__ = (UniqueConstraint("notification_log_id", "user_id", name="uq_notification_read_log_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    notification_log_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notification_log.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
