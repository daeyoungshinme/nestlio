"""서비스 함수를 거쳐 테스트 데이터를 만드는 팩토리 — 모델을 직접 add하면 서비스의 검증·부수효과(growlio 푸시
스테이징, 챌린지 완료 판정 등)를 건너뛰므로, 거래·목표는 이 헬퍼로 만든다. 날짜 기본값은 고정 상수다
(시간 결정론 — tests/CLAUDE.md)."""

from datetime import date
from decimal import Decimal

from app.models.category import Category
from app.models.financial_goal import FinancialGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.services import goal_service, transaction_service


def make_transaction(
    db,
    user: User,
    category: Category,
    amount: Decimal | str = "10000",
    tx_date: date = date(2026, 8, 1),
    *,
    type_: str = "expense",
    **kw,
) -> Transaction:
    return transaction_service.create_transaction(
        db,
        user_id=user.id,
        category_id=category.id,
        type_=type_,
        amount=Decimal(amount),
        transaction_date=tx_date,
        **kw,
    )


def make_challenge(
    db,
    user: User,
    *,
    target: Decimal = Decimal("300000"),
    current: Decimal = Decimal("0"),
    start: date = date(2026, 8, 1),
    end: date = date(2026, 8, 31),
    **kw,
) -> FinancialGoal:
    """2026-08 한 달짜리 외식비 챌린지."""
    return goal_service.create_goal(
        db,
        priority=1,
        name="외식비 줄이기",
        target_age=None,
        required_amount=target,
        monthly_saving_amount=Decimal("0"),
        current_amount=current,
        target_date=end,
        kind="challenge",
        start_date=start,
        created_by_id=user.id,
        **kw,
    )
