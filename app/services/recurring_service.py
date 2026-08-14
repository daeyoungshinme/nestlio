import uuid
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.recurring_expense import RecurringExpense
from app.models.transaction import Transaction
from app.services.transaction_service import create_transaction
from app.utils.dates import add_months_with_day, advance_recurring_date


def list_recurring(db: Session, active_only: bool = True) -> list[RecurringExpense]:
    query = db.query(RecurringExpense)
    if active_only:
        query = query.filter(RecurringExpense.is_active.is_(True))
    return query.order_by(RecurringExpense.next_due_date).all()


def upcoming(db: Session, within_days: int = 14, today: date | None = None) -> list[RecurringExpense]:
    today = today or date.today()
    horizon = today + timedelta(days=within_days)
    return (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.next_due_date <= horizon,
        )
        .order_by(RecurringExpense.next_due_date)
        .all()
    )


def due_in_range(db: Session, range_start: date, range_end: date) -> list[RecurringExpense]:
    """Active recurring expenses whose next scheduled due date falls within [range_start, range_end].
    Used to surface upcoming fixed-cost due dates on the shared calendar."""
    return (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.next_due_date >= range_start,
            RecurringExpense.next_due_date <= range_end,
        )
        .order_by(RecurringExpense.next_due_date)
        .all()
    )


def create_recurring(
    db: Session,
    name: str,
    category_id: int,
    amount: Decimal,
    frequency: str,
    start_date: date,
    created_by: uuid.UUID,
    end_date: date | None = None,
    reminder_days_before: int = 3,
    type_: str = "expense",
    days_of_month: list[int] | None = None,
) -> RecurringExpense:
    day_of_month = min(days_of_month) if days_of_month else start_date.day
    next_due_date = start_date
    if days_of_month:
        # first configured occurrence on/after start_date - same month if a day >= start_date.day
        # exists there (clamped to the month's length), otherwise the earliest day next month.
        month_length = monthrange(start_date.year, start_date.month)[1]
        effective_days = sorted({min(d, month_length) for d in days_of_month})
        candidates_this_month = [d for d in effective_days if d >= start_date.day]
        if candidates_this_month:
            next_due_date = start_date.replace(day=candidates_this_month[0])
        else:
            next_due_date = add_months_with_day(start_date, 1, min(days_of_month))
    recurring = RecurringExpense(
        name=name,
        category_id=category_id,
        amount=amount,
        type=type_,
        frequency=frequency,
        day_of_month=day_of_month,
        days_of_month=days_of_month,
        start_date=start_date,
        end_date=end_date,
        reminder_days_before=reminder_days_before,
        next_due_date=next_due_date,
        created_by=created_by,
        is_active=True,
    )
    db.add(recurring)
    db.commit()
    db.refresh(recurring)
    return recurring


def update_recurring(db: Session, recurring_id: int, **fields) -> RecurringExpense | None:
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is None:
        return None
    for key, value in fields.items():
        setattr(recurring, key, value)
    db.commit()
    db.refresh(recurring)
    return recurring


def deactivate_recurring(db: Session, recurring_id: int) -> None:
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is not None:
        recurring.is_active = False
        db.commit()


def reactivate_recurring(db: Session, recurring_id: int, today: date | None = None) -> RecurringExpense | None:
    """deactivate_recurring의 대칭 함수. 비활성 기간 동안 밀린 next_due_date를 오늘 이후로
    앞당겨서, 재활성화 직후 generate_due_transactions가 소급분을 한꺼번에 만들어버리지
    않게 한다."""
    today = today or date.today()
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is None:
        return None
    recurring.is_active = True
    guard = 0
    while recurring.next_due_date < today and guard < 240:
        guard += 1
        recurring.next_due_date = advance_recurring_date(
            recurring.next_due_date, recurring.frequency, recurring.day_of_month, recurring.days_of_month
        )
    db.commit()
    db.refresh(recurring)
    return recurring


def generate_due_transactions(db: Session, today: date | None = None) -> list[Transaction]:
    """Post a transaction for every active recurring expense whose next_due_date has arrived,
    then roll next_due_date forward. Safe to call repeatedly (idempotent per due date)."""
    today = today or date.today()
    due_items = (
        db.query(RecurringExpense)
        .filter(RecurringExpense.is_active.is_(True), RecurringExpense.next_due_date <= today)
        .all()
    )
    created: list[Transaction] = []
    for recurring in due_items:
        # a recurring expense can be overdue by more than one period (e.g. app was off) -
        # post one transaction per elapsed period rather than skipping ahead silently.
        guard = 0
        while recurring.next_due_date <= today and guard < 24:
            guard += 1
            if recurring.end_date and recurring.next_due_date > recurring.end_date:
                recurring.is_active = False
                break
            tx = create_transaction(
                db,
                user_id=recurring.created_by,
                category_id=recurring.category_id,
                type_=recurring.type,
                amount=recurring.amount,
                transaction_date=recurring.next_due_date,
                description=recurring.name,
                recurring_expense_id=recurring.id,
            )
            created.append(tx)
            recurring.next_due_date = advance_recurring_date(
                recurring.next_due_date, recurring.frequency, recurring.day_of_month, recurring.days_of_month
            )
        db.commit()
    return created
