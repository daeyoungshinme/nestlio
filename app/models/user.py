import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    """growlio와 같은 Supabase 프로젝트의 Auth 사용자를 미러링하는 프로필 테이블.
    id는 Supabase auth.users.id(UUID)와 동일한 값을 사용한다.

    배우자 제거는 하드 삭제가 아니라 removed_at을 채우는 소프트 삭제다 - transactions 등
    8개 테이블이 user_id를 FK로 참조하고 있어 하드 삭제는 FK 위반을 일으킨다. 제거된 행은
    list_users()에서 제외되어 가구 정원(MAX_HOUSEHOLD_USERS)에 다시 자리가 생기지만, 과거
    거래내역 등은 원래 이름 그대로 남는다."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    removed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    removed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", name="fk_users_removed_by_id_users"),
        nullable=True,
        default=None,
    )
