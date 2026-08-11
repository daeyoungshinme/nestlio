from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    account_type: Mapped[str] = mapped_column(String(10))  # 'bank' | 'cash' | 'card'
    initial_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # growlio(자산관리) 은행 계좌 가져오기 연동 — growlio의 AssetAccount.id(UUID 문자열).
    # SavingsProduct와 달리 주기적/자동 동기화(auto_sync)는 하지 않는다: 계좌 잔액은 가계부 거래
    # 내역으로 파생되는 값이라(app/services/account_service.py::current_balance) growlio 값을
    # 그대로 덮어쓰면 거래 기반 잔액과 충돌한다. 대신 사용자가 명시적으로 누르는 수동 동기화
    # (account_service.sync_account)는 이미 반영된 거래 순증감액만큼 initial_balance를 역산해
    # 재조정하는 방식으로 지원한다 — update_account의 "현재 잔액 직접 입력" 역산 로직과 동일하다.
    growlio_account_id: Mapped[str | None] = mapped_column(String(36))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
