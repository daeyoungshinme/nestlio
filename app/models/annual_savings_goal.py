from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnnualSavingsGoal(Base):
    """연도별 순저축(순입금) 목표. growlio의 동명 개념을 이 앱으로 이관한 것 — growlio는 이제 이
    값을 직접 입력받지 않고, 이 앱의 값을 읽기전용으로 동기화해 참고한다(growlio
    app/services/nestlio_client.py). 가구(부부) 공동 값 하나이며 배우자별로 나누지 않는다."""

    __tablename__ = "annual_savings_goals"
    __table_args__ = (UniqueConstraint("year", name="uq_annual_savings_goal_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    target_amount_krw: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    # NULL이면 target_amount_krw/12를 균등 월 목표로 간주 (growlio 쪽 계산 관례와 동일)
    monthly_target_krw: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
