import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationReaction(Base):
    """NotificationLog(가구 단위 로그) 한 건에 배우자가 남기는 짧은 응원 반응(이모지 + 선택
    한 줄 메시지). 유저당 알림 하나에 반응 하나만 남길 수 있다 — 다시 보내면 기존 반응을
    덮어쓴다(NotificationRead와 동일하게 배우자별로 독립적)."""

    __tablename__ = "notification_reaction"
    __table_args__ = (UniqueConstraint("notification_log_id", "user_id", name="uq_notification_reaction_log_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    notification_log_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notification_log.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    emoji: Mapped[str] = mapped_column(String(8))
    message: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
