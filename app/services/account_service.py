from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction


def list_accounts(db: Session, active_only: bool = True) -> list[Account]:
    query = db.query(Account)
    if active_only:
        query = query.filter(Account.is_active.is_(True))
    return query.order_by(Account.sort_order, Account.name).all()


def create_account(db: Session, name: str, account_type: str, initial_balance: Decimal) -> Account:
    account = Account(name=name, account_type=account_type, initial_balance=initial_balance, sort_order=999)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def deactivate_account(db: Session, account_id: int) -> None:
    account = db.get(Account, account_id)
    if account is not None:
        account.is_active = False
        db.commit()


def current_balance(db: Session, account: Account) -> Decimal:
    income = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.account_id == account.id, Transaction.type == "income")
        .scalar()
        or Decimal("0")
    )
    expense = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.account_id == account.id, Transaction.type == "expense")
        .scalar()
        or Decimal("0")
    )
    return Decimal(account.initial_balance) + Decimal(income) - Decimal(expense)


def list_with_balances(db: Session) -> list[dict]:
    return [
        {"account": account, "balance": current_balance(db, account)}
        for account in list_accounts(db)
    ]
