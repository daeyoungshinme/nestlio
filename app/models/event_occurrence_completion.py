from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.utils.dates import now_kst


class EventOccurrenceCompletion(Base):
    """반복 일정의 회차별 완료 기록. 행이 있으면 그 날짜 회차는 완료다(단건 일정은 Event.completed_at을 쓴다).
    시각이 아니라 날짜로 묶어, 일정의 시간만 바꿔도 완료가 유지된다."""

    __tablename__ = "event_occurrence_completions"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    occurrence_date: Mapped[date] = mapped_column(Date, primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst)
