from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GoogleOAuthToken(Base):
    """싱글톤 행 — 부부 앱이 연결하는 구글 계정은 하나뿐이므로 여러 행을 두지 않는다."""

    __tablename__ = "google_oauth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    access_token: Mapped[str] = mapped_column(String(2000))
    refresh_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    token_uri: Mapped[str] = mapped_column(String(200))
    scopes: Mapped[str] = mapped_column(String(500))  # 콤마로 join (sqlite/postgres 양쪽 호환)
    expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
