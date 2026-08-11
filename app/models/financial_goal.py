from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.goal_funding_source import GoalFundingSource


class FinancialGoal(Base):
    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(100))
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
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    funding_sources: Mapped[list["GoalFundingSource"]] = relationship(
        lazy="joined", order_by="GoalFundingSource.id", cascade="all, delete-orphan"
    )

    # current_amount/progress_pct는 연동된 계좌 잔액이 거래내역 기반 파생값이라 DB 세션 없이는
    # 계산할 수 없다 — app/services/goal_service.py의 compute_current_amount/compute_progress_pct 참고.
