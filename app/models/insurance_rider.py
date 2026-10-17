from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.money import monthly_equivalent

if TYPE_CHECKING:
    from app.models.insurance_policy import InsurancePolicy


class InsuranceRider(Base):
    """보험 계약의 특약 — 보장별 가입금액·특약 보험료로 보장 과다(감액 후보)·실손형 중복을 특약 단위로 본다.
    부부가 주요 특약만 입력하므로 계약 보험료 − 특약 합은 "주계약·기타"로 남는다."""

    __tablename__ = "insurance_riders"

    id: Mapped[int] = mapped_column(primary_key=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("insurance_policies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    # schemas/insurance.py Coverage 또는 "other"
    coverage: Mapped[str] = mapped_column(String(30))
    # 가입금액(보험금). 입원일당은 1일 금액
    coverage_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    # 계약의 납입 주기(payment_frequency) 기준 특약 보험료
    premium: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    is_renewable: Mapped[bool] = mapped_column(Boolean, default=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    policy: Mapped["InsurancePolicy"] = relationship(back_populates="riders")

    @property
    def monthly_premium(self) -> Decimal:
        """월 환산 특약 보험료 — 계약이 연납이면 12로 나눠 원 단위 반올림."""
        return monthly_equivalent(self.premium, self.policy.payment_frequency if self.policy is not None else "monthly")
