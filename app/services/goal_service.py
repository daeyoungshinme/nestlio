from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal
from app.models.goal_funding_source import GoalFundingSource
from app.services import account_service
from app.utils.dates import months_between


def list_goals(db: Session) -> list[FinancialGoal]:
    return db.query(FinancialGoal).order_by(FinancialGoal.priority, FinancialGoal.sort_order).all()


def get_goal(db: Session, goal_id: int) -> FinancialGoal | None:
    return db.get(FinancialGoal, goal_id)


def funding_source_breakdown(db: Session, goal: FinancialGoal) -> list[dict]:
    items: list[dict] = []
    for fs in goal.funding_sources:
        if fs.savings_product_id is not None:
            items.append(
                {
                    "type": "savings_product",
                    "id": fs.savings_product_id,
                    "name": fs.savings_product.name,
                    "amount": fs.savings_product.current_balance,
                }
            )
        elif fs.account_id is not None:
            items.append(
                {
                    "type": "account",
                    "id": fs.account_id,
                    "name": fs.account.name,
                    "amount": account_service.current_balance(db, fs.account),
                }
            )
        elif fs.loan_id is not None:
            items.append(
                {
                    "type": "loan",
                    "id": fs.loan_id,
                    "name": fs.loan.name,
                    "amount": -fs.loan.balance,
                }
            )
    return items


def _sum_breakdown_amounts(goal: FinancialGoal, breakdown: list[dict]) -> Decimal:
    """연동이 하나도 없으면 수동 입력값, 있으면 breakdown 금액 합(저축상품·계좌는 더하고 대출은
    이미 음수로 들어있어 자연히 차감된다)."""
    if not goal.funding_sources:
        return goal.manual_current_amount
    return sum((item["amount"] for item in breakdown), Decimal("0"))


def compute_current_amount(db: Session, goal: FinancialGoal) -> Decimal:
    """연동된 저축상품·계좌 잔액 합에서 연동된 대출 잔액을 뺀 값. 연동이 하나도 없으면 수동 입력값."""
    return _sum_breakdown_amounts(goal, funding_source_breakdown(db, goal))


def compute_progress_pct(current_amount: Decimal, required_amount: Decimal) -> Decimal:
    if not required_amount:
        return Decimal("0")
    return min(current_amount / required_amount * 100, Decimal("100"))


def compute_months_remaining(today: date, target_date: date | None) -> int | None:
    if target_date is None:
        return None
    return max(0, months_between(today, target_date))


def compute_suggested_monthly_amount(
    current_amount: Decimal, required_amount: Decimal, months_remaining: int | None
) -> Decimal | None:
    if not months_remaining:
        return None
    return max(Decimal("0"), (required_amount - current_amount) / months_remaining)


# compute_projected_months_with_growth의 개월수 탐색 상한(50년) — 이보다 오래 걸리면 도달 불가로 본다.
MAX_PROJECTION_MONTHS = 600


def compute_weighted_return_rate_pct(goal: FinancialGoal) -> Decimal | None:
    """목표에 연동된 투자형 저축상품들의 잔액 가중평균 수익률(원금 대비 손익률,
    SavingsProduct.return_rate_pct). 연동된 투자 상품이 없거나 전부 원금 미입력이라 수익률을
    계산할 수 없으면 None."""
    total_balance = Decimal("0")
    weighted_sum = Decimal("0")
    for fs in goal.funding_sources:
        if fs.savings_product_id is None:
            continue
        product = fs.savings_product
        if product.product_type != "investment" or product.return_rate_pct is None:
            continue
        total_balance += product.current_balance
        weighted_sum += product.current_balance * product.return_rate_pct
    if total_balance <= 0:
        return None
    return weighted_sum / total_balance


def compute_projected_months_with_growth(
    current_amount: Decimal,
    monthly_saving_amount: Decimal,
    required_amount: Decimal,
    assumed_annual_return_pct: Decimal,
) -> int | None:
    """월 저축금액과 가정 연 수익률(월 복리 재투자 가정)로 목표금액에 도달하는 데 걸리는
    예상 개월수를 계산한다. 이미 달성했으면 0, 저축도 없고 자산도 없어 영원히 도달 못 하면
    None. assumed_annual_return_pct는 원금 대비 현재 손익률을 그대로 연 수익률처럼 가정한
    값이라 보유기간에 따라 실제 연환산 수익률과 다를 수 있다 — 어디까지나 추정치다."""
    if required_amount <= current_amount:
        return 0
    if current_amount <= 0 and monthly_saving_amount <= 0:
        return None
    monthly_rate = assumed_annual_return_pct / Decimal("100") / Decimal("12")
    balance = current_amount
    for month in range(1, MAX_PROJECTION_MONTHS + 1):
        balance = balance * (1 + monthly_rate) + monthly_saving_amount
        if balance >= required_amount:
            return month
    return None


def to_out(db: Session, goal: FinancialGoal, today: date) -> dict:
    breakdown = funding_source_breakdown(db, goal)
    current_amount = _sum_breakdown_amounts(goal, breakdown)
    months_remaining = compute_months_remaining(today, goal.target_date)
    weighted_return_rate_pct = compute_weighted_return_rate_pct(goal)
    projected_months_with_growth = (
        compute_projected_months_with_growth(
            current_amount, goal.monthly_saving_amount, goal.required_amount, weighted_return_rate_pct
        )
        if weighted_return_rate_pct is not None
        else None
    )
    return {
        "id": goal.id,
        "priority": goal.priority,
        "name": goal.name,
        "target_age": goal.target_age,
        "target_date": goal.target_date,
        "required_amount": goal.required_amount,
        "monthly_saving_amount": goal.monthly_saving_amount,
        "current_amount": current_amount,
        "progress_pct": compute_progress_pct(current_amount, goal.required_amount),
        "sort_order": goal.sort_order,
        "funding_sources": breakdown,
        "months_remaining": months_remaining,
        "suggested_monthly_amount": compute_suggested_monthly_amount(
            current_amount, goal.required_amount, months_remaining
        ),
        "weighted_return_rate_pct": weighted_return_rate_pct,
        "projected_months_with_growth": projected_months_with_growth,
    }


def _apply_funding_sources(goal: FinancialGoal, funding_sources: list[dict] | None) -> None:
    existing_by_key = {
        (fs.savings_product_id, fs.account_id, fs.loan_id): fs for fs in goal.funding_sources
    }
    new_sources: list[GoalFundingSource] = []
    seen: set[tuple[str, int]] = set()
    for item in funding_sources or []:
        source_type, source_id = item["type"], item["id"]
        key = (source_type, source_id)
        if key in seen:
            continue
        seen.add(key)
        if source_type == "savings_product":
            existing_key = (source_id, None, None)
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(savings_product_id=source_id))
        elif source_type == "account":
            existing_key = (None, source_id, None)
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(account_id=source_id))
        elif source_type == "loan":
            existing_key = (None, None, source_id)
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(loan_id=source_id))
    goal.funding_sources = new_sources


def create_goal(
    db: Session,
    priority: int,
    name: str,
    target_age: int | None,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    current_amount: Decimal = Decimal("0"),
    funding_sources: list[dict] | None = None,
    target_date: date | None = None,
) -> FinancialGoal:
    goal = FinancialGoal(
        priority=priority,
        name=name,
        target_age=target_age,
        target_date=target_date,
        required_amount=required_amount,
        monthly_saving_amount=monthly_saving_amount,
        manual_current_amount=current_amount,
        sort_order=999,
    )
    _apply_funding_sources(goal, funding_sources)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def update_goal(
    db: Session,
    goal_id: int,
    priority: int,
    name: str,
    target_age: int | None,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    current_amount: Decimal = Decimal("0"),
    funding_sources: list[dict] | None = None,
    target_date: date | None = None,
) -> FinancialGoal | None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is None:
        return None
    goal.priority = priority
    goal.name = name
    goal.target_age = target_age
    goal.target_date = target_date
    goal.required_amount = required_amount
    goal.monthly_saving_amount = monthly_saving_amount
    goal.manual_current_amount = current_amount
    _apply_funding_sources(goal, funding_sources)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, goal_id: int) -> None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is not None:
        db.delete(goal)
        db.commit()
