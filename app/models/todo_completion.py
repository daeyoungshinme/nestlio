import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import User
from app.utils.dates import now_kst


class TodoCompletion(Base):
    """"각자 완료" 할일(Todo.each_completes)의 사람별 체크. 행이 있으면 그 사람은 자기 몫을 끝냈다.
    가구의 활성 사용자 전원이 체크하면 Todo.completed_at이 채워진다(todo_service.set_completed)."""

    __tablename__ = "todo_completions"

    todo_id: Mapped[int] = mapped_column(ForeignKey("todos.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst)

    user: Mapped["User"] = relationship(lazy="joined")
