import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.utils.dates import now_kst
from app.utils.money import whole_won


class InsurancePolicy(Base):
    """보험 계약 — 보험 점검(insurance_review_service)이 실손 중복·갱신 임박·납입 완료 등을 계약 단위로 본다.
    실제 납입은 반복거래(recurring_expense_id)·거래가 맡고, 이 행은 점검용 계약 정보만 담는다."""

    __tablename__ = "insurance_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    insurer: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # schemas/insurance.py PolicyType — indemnity(실손)·diagnosis(진단)·life·accident·auto·home·savings(저축성·연금)·other
    policy_type: Mapped[str] = mapped_column(String(20))
    # 피보험자. 부부가 아니면(자녀 등) NULL + insured_name
    insured_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    insured_name: Mapped[str | None] = mapped_column(String(30), nullable=True)
    premium_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    payment_frequency: Mapped[str] = mapped_column(String(10), default="monthly")  # 'monthly' | 'yearly'
    is_renewable: Mapped[bool] = mapped_column(Boolean, default=False)
    next_renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # 납입만기
    coverage_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # 보장만기
    # 보장 태그 목록(schemas/insurance.py Coverage) — 같은 피보험자의 보장 중복 판정용
    coverages: Mapped[list[str]] = mapped_column(JSON, default=list)
    recurring_expense_id: Mapped[int | None] = mapped_column(ForeignKey("recurring_expenses.id"), nullable=True)
    memo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_kst, server_default=func.now(), onupdate=now_kst)

    @property
    def monthly_premium(self) -> Decimal:
        """월 환산 보험료 — 연납은 12로 나눠 원 단위 반올림."""
        if self.payment_frequency == "yearly":
            return whole_won(self.premium_amount / 12)
        return self.premium_amount
