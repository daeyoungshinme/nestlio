import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, false, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.todo_completion import TodoCompletion
from app.models.user import User
from app.utils.dates import now_kst


class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    memo: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    frequency: Mapped[str] = mapped_column(String(10), default="once")  # 'once' | 'weekly' | 'monthly' | 'yearly'
    # 월·연 반복의 기준일 - 31일 → 2월 28일 → 3월 31일로 돌아오도록 due_date.day와 따로 둔다.
    recurrence_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 담당자 - None이면 "공동"(두 사람 모두 담당). Event.assignee_id처럼 접근 제어용이 아니라 귀속 표시용이다.
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # "각자 완료" - 공동 할일에서만 켠다. 두 사람이 각자 체크(TodoCompletion)해야 completed_at이 채워진다.
    each_completes: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # 중요 표시 - 목록에서 같은 기한 긴급도 안에서 먼저 보인다(정렬은 프론트 utils/todos.ts sortOpenTodos).
    is_important: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # 반복 할일은 회차마다 한 행이다(회차별로 완료가 갈린다). 이 행을 만든 이전 회차.
    previous_todo_id: Mapped[int | None] = mapped_column(ForeignKey("todos.id", ondelete="SET NULL"), nullable=True)
    # "nullable timestamp = 상태 마커" 패턴 - 채워지면 완료.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    completed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst, server_default=func.now())

    # users를 참조하는 FK가 여러 개라 관계마다 foreign_keys를 명시해야 한다(models/event.py 참고).
    creator: Mapped["User"] = relationship(foreign_keys=[created_by], lazy="joined")
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id], lazy="joined")
    completer: Mapped["User | None"] = relationship(foreign_keys=[completed_by], lazy="joined")
    # 컬렉션이라 joined로 걸면 목록 쿼리에 unique()가 필요해진다 — selectin으로 한 번에 따로 읽는다.
    completions: Mapped[list["TodoCompletion"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by=TodoCompletion.completed_at
    )
