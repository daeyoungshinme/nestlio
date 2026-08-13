import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavingsProduct(Base):
    __tablename__ = "savings_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    product_type: Mapped[str] = mapped_column(
        String(20), default="savings"
    )  # 'savings' | 'investment' | 'real_estate' | 'emergency_fund'
    # 투자/부동산 전용: 지금까지 납입한 원금(투자) 또는 매입가(부동산). 저축(savings) 상품은
    # 원금=잔액이라 의미가 없어 nullable로 둔다.
    principal_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    # 부부 중 누구 소유인지 (NULL이면 공통/가구 공유). growlio에서 가져온 상품은 가져오기를 실행한
    # 사용자로 자동 설정된다 — growlio 자체가 그 사람의 Supabase JWT 기준으로 스코프되기 때문.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # growlio(자산관리) 계좌 자동 동기화 연동 — growlio의 AssetAccount.id(UUID 문자열)
    growlio_account_id: Mapped[str | None] = mapped_column(String(36))
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def return_amount(self) -> Decimal | None:
        """투자/부동산 상품의 평가손익(현재 잔액 - 원금). 원금 미입력 시 계산 불가(None)."""
        if self.product_type not in ("investment", "real_estate") or self.principal_amount is None:
            return None
        return self.current_balance - self.principal_amount

    @property
    def return_rate_pct(self) -> Decimal | None:
        if self.product_type not in ("investment", "real_estate") or not self.principal_amount:
            return None
        return (self.current_balance - self.principal_amount) / self.principal_amount * 100
