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
    accounts = list_accounts(db)
    account_ids = [account.id for account in accounts]
    rows = (
        db.query(Transaction.account_id, Transaction.type, func.sum(Transaction.amount))
        .filter(Transaction.account_id.in_(account_ids))
        .group_by(Transaction.account_id, Transaction.type)
        .all()
    )
    totals: dict[int, dict[str, Decimal]] = {}
    for account_id, tx_type, amount in rows:
        totals.setdefault(account_id, {})[tx_type] = amount or Decimal("0")

    return [
        {
            "account": account,
            "balance": (
                Decimal(account.initial_balance)
                + totals.get(account.id, {}).get("income", Decimal("0"))
                - totals.get(account.id, {}).get("expense", Decimal("0"))
            ),
        }
        for account in accounts
    ]
