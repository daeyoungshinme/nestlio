from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    notif_type: Mapped[str] = mapped_column(String(30))
    # 'email_weekly' | 'email_monthly' | 'threshold_alert' | 'event_reminder' | 'goal_milestone'
    # | 'challenge_success' — on/off 토글은 app/services/notification_prefs_service.py 참고.
    related_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    related_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # dedupe key: 'YYYY-MM' for monthly/threshold notifs, 'YYYY-MM-DD' (week start) for weekly,
    # full ISO datetime for event_reminder (one dedupe entry per occurrence)
    year_month: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="sent")
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
