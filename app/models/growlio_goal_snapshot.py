import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.utils.dates import now_kst


class GrowlioGoalSnapshot(Base):
    """사용자 한 명이 growlio에 설정한 투자목표와 그 진행 상황의 마지막 값(GET /external/goal).

    nestlio는 호출자 JWT로만 growlio를 읽을 수 있어 배우자의 growlio 목표를 실시간으로 조회할 수 없다. 그래서 각자
    nestlio를 열 때(또는 "지금 동기화"를 누를 때) 본인 값을 여기 저장해 두고, 부부 통합 목표(kind="combined")는 두
    사람의 행을 합산한다 — 배우자 값은 `synced_at`과 함께 보여준다(growlio_goal_snapshot_service).

    금액 기준은 growlio 목표와 같다: `investable_assets`는 부동산을 뺀 투자자산이다. growlio가 구버전이거나 요약 계산이
    실패하면 진행 필드는 None(설정값만 있음)."""

    __tablename__ = "growlio_goal_snapshots"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", name="fk_growlio_goal_snapshots_user_id_users"),
        primary_key=True,
    )
    is_configured: Mapped[bool] = mapped_column(Boolean, default=False)
    goal_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    investable_assets: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    monthly_deposit_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    annual_deposit_goal: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    annual_deposit_current: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    annual_dividend_goal: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    estimated_annual_dividend: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    goal_annual_return_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    actual_return_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    retirement_target_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst, onupdate=now_kst)
