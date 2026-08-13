import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.goal_funding_source import GoalFundingSource


class FinancialGoal(Base):
    """`kind`가 `"goal"`(기본, 장기 재무목표)이면 사실상 모든 필드가 재무목표 용도로 쓰이고,
    `"challenge"`(단기 부부 챌린지, 옛 Challenge 모델 흡수)이면 required_amount/manual_current_amount/
    target_date가 각각 목표금액/진행금액/종료일로 쓰이며 description·start_date·status·
    completed_at·created_by_id가 추가로 채워진다 (goal_service.py 참고)."""

    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), default="goal")  # 'goal' | 'challenge'
    priority: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    target_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 나이 기반(target_age) 입력의 보완 — 부부 공동 목표에서 "나이"는 누구 기준인지 모호하고
    # 매번 현재 나이를 재입력해야 계산되던 방식을, 오늘 날짜 기준 결정론적 계산으로 대체한다
    # (app/services/goal_service.py::to_out 참고). target_age와 공존하며 둘 다 선택 입력이다.
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    required_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    monthly_saving_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # 실제 컬럼명은 그대로 current_amount(하위호환) — 연동된 저축상품(funding_sources)이 하나라도
    # 있으면 이 수동 입력값 대신 연동 상품들의 잔액 합이 진행률 계산에 쓰인다. 아래 current_amount 참고.
    manual_current_amount: Mapped[Decimal] = mapped_column("current_amount", Numeric(14, 2), default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 아래 4개는 kind="challenge"일 때만 채워진다 (일반 목표에서는 미사용).
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="active")  # 'active' | 'succeeded'
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    funding_sources: Mapped[list["GoalFundingSource"]] = relationship(
        lazy="joined", order_by="GoalFundingSource.id", cascade="all, delete-orphan"
    )

    # current_amount/progress_pct는 연동된 계좌 잔액이 거래내역 기반 파생값이라 DB 세션 없이는
    # 계산할 수 없다 — app/services/goal_service.py의 compute_current_amount/compute_progress_pct 참고.
