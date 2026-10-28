import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.account import Account
from app.utils.dates import now_kst


class Card(Base):
    """결제카드 — 가계부에서 카드를 고르면 거래의 계좌(account_id)·결제수단(payment_method)을 이 카드의
    결제계좌·종류로 채운다(transaction_service._apply_card). 신용카드도 결제일이 아니라 사용일에 결제계좌에서
    빠진 것으로 본다. 계좌는 저장 시점에 거래로 복사하므로 결제계좌를 바꿔도 지난 거래의 계좌는 그대로다."""

    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    card_type: Mapped[str] = mapped_column(String(10))  # 'credit' | 'debit'
    # 옮겨 온 예전 카드 계좌(account_type='card')로 만든 카드는 결제계좌가 아직 없다
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst, server_default=func.now(), onupdate=now_kst)

    payment_account: Mapped["Account | None"] = relationship(lazy="joined")
