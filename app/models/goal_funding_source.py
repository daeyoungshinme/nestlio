from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.account import Account
from app.models.loan import Loan
from app.models.savings_product import SavingsProduct


class GoalFundingSource(Base):
    """FinancialGoal과 (SavingsProduct|Account|Loan) 중 하나를 연결하는 행. 목표 하나를 저축상품·계좌
    여러 개(예: 부부가 각자 다른 상품/계좌로 모으는 경우)와 대출(차감 대상)로 채울 수 있게 한다 —
    FinancialGoal.current_amount는 이제 모델이 아니라 app/services/goal_service.py의
    compute_current_amount(db, goal)에서 계산된다 (계좌 잔액이 거래내역 기반 파생값이라 DB 세션이
    필요하기 때문). savings_product_id/account_id/loan_id 중 정확히 하나만 채워진다."""

    __tablename__ = "goal_funding_sources"
    __table_args__ = (
        UniqueConstraint("goal_id", "savings_product_id", name="uq_goal_funding_source"),
        UniqueConstraint("goal_id", "account_id", name="uq_goal_funding_source_account"),
        UniqueConstraint("goal_id", "loan_id", name="uq_goal_funding_source_loan"),
        # 한 상품이 서로 다른 두 목표에 동시에 연동되면 잔액이 두 목표에 중복 집계되므로 막는다 —
        # 목표 1개가 상품 여러 개를 연동하는 것(부부가 각자 다른 상품으로 모으는 경우)은 계속
        # 허용하되, 그 경우 월 계획액 자동 동기화는 적용하지 않는다(app/services/goal_service.py::
        # _sync_funding_product_monthly_amount). NULL(계좌/대출 타입 행)은 이 제약에서 서로
        # 충돌하지 않는다(표준 UNIQUE는 NULL을 각각 별개 값으로 취급).
        UniqueConstraint("savings_product_id", name="uq_goal_funding_source_savings_product_unique"),
        CheckConstraint(
            "(CASE WHEN savings_product_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN account_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN loan_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_goal_funding_source_exactly_one_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("financial_goals.id", ondelete="CASCADE"))
    savings_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("savings_products.id", ondelete="CASCADE")
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE", name="fk_goal_funding_sources_account_id")
    )
    loan_id: Mapped[int | None] = mapped_column(
        ForeignKey("loans.id", ondelete="CASCADE", name="fk_goal_funding_sources_loan_id")
    )

    savings_product: Mapped["SavingsProduct"] = relationship(lazy="joined")
    account: Mapped["Account"] = relationship(lazy="joined")
    loan: Mapped["Loan"] = relationship(lazy="joined")
    goal: Mapped["FinancialGoal"] = relationship(lazy="joined", viewonly=True)
