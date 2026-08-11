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


def compute_current_amount(db: Session, goal: FinancialGoal) -> Decimal:
    """연동된 저축상품·계좌 잔액 합에서 연동된 대출 잔액을 뺀 값. 연동이 하나도 없으면 수동 입력값."""
    if not goal.funding_sources:
        return goal.manual_current_amount
    total = Decimal("0")
    for fs in goal.funding_sources:
        if fs.savings_product_id is not None:
            total += fs.savings_product.current_balance
        elif fs.account_id is not None:
            total += account_service.current_balance(db, fs.account)
        elif fs.loan_id is not None:
            total -= fs.loan.balance
    return total


def compute_progress_pct(current_amount: Decimal, required_amount: Decimal) -> Decimal:
    if not required_amount:
        return Decimal("0")
    return min(current_amount / required_amount * 100, Decimal("100"))


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


def to_out(db: Session, goal: FinancialGoal, today: date) -> dict:
    current_amount = compute_current_amount(db, goal)
    months_remaining = compute_months_remaining(today, goal.target_date)
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
        "funding_sources": funding_source_breakdown(db, goal),
        "months_remaining": months_remaining,
        "suggested_monthly_amount": compute_suggested_monthly_amount(
            current_amount, goal.required_amount, months_remaining
        ),
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
