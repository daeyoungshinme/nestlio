import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.loan import Loan


def list_loans(db: Session, active_only: bool = True) -> list[Loan]:
    query = db.query(Loan)
    if active_only:
        query = query.filter(Loan.is_active.is_(True))
    return query.order_by(Loan.sort_order, Loan.name).all()


def create_loan(
    db: Session,
    name: str,
    balance: Decimal,
    monthly_payment: Decimal,
    origination_year_month: str | None,
    term_months: int | None,
    interest_rate: Decimal | None,
    repayment_method: str | None,
    owner_user_id: uuid.UUID | None = None,
) -> Loan:
    loan = Loan(
        name=name,
        balance=balance,
        monthly_payment=monthly_payment,
        origination_year_month=origination_year_month,
        term_months=term_months,
        interest_rate=interest_rate,
        repayment_method=repayment_method,
        sort_order=999,
        owner_user_id=owner_user_id,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


def update_loan(
    db: Session,
    loan_id: int,
    name: str,
    balance: Decimal,
    monthly_payment: Decimal,
    origination_year_month: str | None,
    term_months: int | None,
    interest_rate: Decimal | None,
    repayment_method: str | None,
    owner_user_id: uuid.UUID | None = None,
) -> Loan | None:
    loan = db.get(Loan, loan_id)
    if loan is None:
        return None
    loan.name = name
    loan.balance = balance
    loan.monthly_payment = monthly_payment
    loan.origination_year_month = origination_year_month
    loan.term_months = term_months
    loan.interest_rate = interest_rate
    loan.repayment_method = repayment_method
    loan.owner_user_id = owner_user_id
    db.commit()
    db.refresh(loan)
    return loan


def deactivate_loan(db: Session, loan_id: int) -> None:
    loan = db.get(Loan, loan_id)
    if loan is not None:
        loan.is_active = False
        db.commit()
