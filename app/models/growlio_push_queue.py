import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GrowlioPushQueue(Base):
    """growlio 계좌로 보낼 입출금 한 건(아웃박스). 저축·투자 거래를 저장/수정/삭제할 때마다 growlio에 반영할 동작을
    여기 먼저 남기고 바로 보내 본다 — 실패하면 남겨 두었다가 다음 화면 로드 때(호출자 JWT가 있을 때) 다시 보낸다.
    growlio에는 `external_ref = "nestlio:q{id}"`로 보내 같은 행을 몇 번 재전송해도 한 번만 기록된다(growlio 쪽 멱등).

    거래가 삭제돼도 반영할 동작은 남아야 하므로 거래·상품을 FK로 묶지 않고 보낼 값(growlio 계좌·금액·날짜)을 그대로
    복사해 둔다. owner_user_id는 상품 소유자 — 호출자 JWT로는 배우자 소유 growlio 계좌에 쓸 수 없어 재전송 대상을
    호출자·공동(NULL) 소유로 거른다(net_worth_service.refresh_stale_growlio_links와 같은 규칙)."""

    __tablename__ = "growlio_push_queue"

    id: Mapped[int] = mapped_column(primary_key=True)
    growlio_account_id: Mapped[str] = mapped_column(String(36))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", name="fk_growlio_push_queue_owner_user_id_users"), nullable=True
    )
    # 참고용(어느 가계부 거래에서 나왔는지) — 거래가 지워져도 행은 남으므로 FK가 아니다.
    transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transaction_type: Mapped[str] = mapped_column(String(10))  # 'DEPOSIT' | 'WITHDRAWAL'
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    transaction_date: Mapped[date] = mapped_column(Date)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 채워지면 growlio에 반영 완료(nullable timestamp = 상태 마커).
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
