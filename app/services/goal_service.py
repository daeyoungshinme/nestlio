from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal


def list_goals(db: Session) -> list[FinancialGoal]:
    return db.query(FinancialGoal).order_by(FinancialGoal.priority, FinancialGoal.sort_order).all()


def get_goal(db: Session, goal_id: int) -> FinancialGoal | None:
    return db.get(FinancialGoal, goal_id)


def create_goal(
    db: Session,
    priority: int,
    name: str,
    target_age: int | None,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    current_amount: Decimal = Decimal("0"),
    primary_savings_product_id: int | None = None,
) -> FinancialGoal:
    goal = FinancialGoal(
        priority=priority,
        name=name,
        target_age=target_age,
        required_amount=required_amount,
        monthly_saving_amount=monthly_saving_amount,
        manual_current_amount=current_amount,
        primary_savings_product_id=primary_savings_product_id,
        sort_order=999,
    )
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
    primary_savings_product_id: int | None = None,
) -> FinancialGoal | None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is None:
        return None
    goal.priority = priority
    goal.name = name
    goal.target_age = target_age
    goal.required_amount = required_amount
    goal.monthly_saving_amount = monthly_saving_amount
    goal.manual_current_amount = current_amount
    goal.primary_savings_product_id = primary_savings_product_id
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, goal_id: int) -> None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is not None:
        db.delete(goal)
        db.commit()
