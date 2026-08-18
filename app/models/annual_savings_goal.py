from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnnualSavingsGoal(Base):
    """연도별 순저축(순입금) 목표. growlio의 동명 개념을 이 앱으로 이관한 것 — growlio는 이제 이
    값을 직접 입력받지 않고, 이 앱의 값을 읽기전용으로 동기화해 참고한다(growlio
    app/services/nestlio_client.py). 가구(부부) 공동 값 하나이며 배우자별로 나누지 않는다.
    target_amount_krw는 monthly_targets(1~12월) 합계로 파생되는 값이다(직접 입력 X) —
    app/services/annual_savings_goal_service.py 참고."""

    __tablename__ = "annual_savings_goals"
    __table_args__ = (UniqueConstraint("year", name="uq_annual_savings_goal_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    target_amount_krw: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    monthly_targets: Mapped[list["AnnualSavingsGoalMonthlyTarget"]] = relationship(
        cascade="all, delete-orphan", order_by="AnnualSavingsGoalMonthlyTarget.year_month"
    )

    @property
    def monthly_target_krw(self) -> Decimal | None:
        """옛 '월간 목표금액 직접입력' 필드의 하위호환용 파생값 — growlio 외부 연동 응답
        (app/routers/external.py)이 여전히 참조하므로 필드 자체는 남기고 값만 연간 총액의 평균으로
        계산한다. nestlio 화면은 이제 monthly_targets 배열의 각 달 값을 직접 쓴다."""
        return self.target_amount_krw / 12 if self.target_amount_krw else None
