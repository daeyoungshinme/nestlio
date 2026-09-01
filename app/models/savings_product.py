import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, false, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavingsProduct(Base):
    __tablename__ = "savings_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    product_type: Mapped[str] = mapped_column(
        String(20), default="savings", server_default="savings"
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
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)

    # 상품 1개는 최대 1개 목표의 funding source만 될 수 있다(goal_funding_sources.savings_product_id
    # unique 제약, app/models/goal_funding_source.py 참고) — 연동 시 월 계획액을 그 목표의
    # monthly_saving_amount와 동기화하기 위한 역참조(app/services/goal_service.py 참고).
    goal_funding_source: Mapped["GoalFundingSource | None"] = relationship(
        uselist=False, viewonly=True, lazy="joined"
    )

    @property
    def linked_goal_id(self) -> int | None:
        return self.goal_funding_source.goal_id if self.goal_funding_source else None

    @property
    def linked_goal_name(self) -> str | None:
        return self.goal_funding_source.goal.name if self.goal_funding_source else None

    @property
    def monthly_saving_amount_synced(self) -> bool:
        """월 계획액이 연동된 목표에서 자동으로 채워지는 중인지 — 그 목표에 연동된 저축상품이 이
        상품 하나뿐일 때만 참이다. 상품이 여러 개면(부부가 각자 다른 상품으로 한 목표를 모으는
        경우) 잔액 합산에는 쓰이지만 월 계획액을 어느 상품에 나눠줄지 모호해 계속 수동 입력을
        받는다(app/services/goal_service.py::_sync_funding_product_monthly_amount와 판정 기준 동일)."""
        if self.goal_funding_source is None:
            return False
        goal = self.goal_funding_source.goal
        linked_product_count = sum(1 for fs in goal.funding_sources if fs.savings_product_id is not None)
        return linked_product_count == 1

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
