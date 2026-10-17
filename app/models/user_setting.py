import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSetting(Base):
    """부부 공유 설정(key/value) — key당 한 행이다(누가 저장해도 같은 행을 덮어쓴다). user_id는 마지막으로 저장한 사람."""

    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("key", name="uq_user_settings_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    key: Mapped[str] = mapped_column(String(100))
    value: Mapped[str] = mapped_column(String(500))
