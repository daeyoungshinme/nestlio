from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.net_worth_snapshot import NetWorthSnapshot
from app.services import account_service, loan_service, savings_product_service
from app.utils.dates import parse_year_month, shift_month, year_month_str


def compute_current(db: Session) -> dict:
    accounts_total = sum(
        (row["balance"] for row in account_service.list_with_balances(db)), Decimal("0")
    )
    savings_total = sum(
        (product.current_balance for product in savings_product_service.list_products(db)), Decimal("0")
    )
    loans_total = sum(
        (loan.balance for loan in loan_service.list_loans(db)), Decimal("0")
    )
    return {
        "accounts_total": accounts_total,
        "savings_total": savings_total,
        "loans_total": loans_total,
        "net_worth": accounts_total + savings_total - loans_total,
    }


def record_snapshot(db: Session, today: date) -> NetWorthSnapshot:
    breakdown = compute_current(db)
    year_month = year_month_str(today)
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.year_month == year_month).first()
    if snapshot is None:
        snapshot = NetWorthSnapshot(year_month=year_month, snapshot_date=today, **breakdown)
        db.add(snapshot)
    else:
        snapshot.snapshot_date = today
        snapshot.accounts_total = breakdown["accounts_total"]
        snapshot.savings_total = breakdown["savings_total"]
        snapshot.loans_total = breakdown["loans_total"]
        snapshot.net_worth = breakdown["net_worth"]
    db.commit()
    db.refresh(snapshot)
    return snapshot


def savings_delta(db: Session, year_month: str) -> Decimal | None:
    """Actual amount added to savings/investment products during `year_month`,
    derived from the change in savings_total between this month's snapshot and
    the previous month's. None if either snapshot is missing."""
    prev_year_month = year_month_str(shift_month(parse_year_month(year_month), -1))
    current = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.year_month == year_month).first()
    previous = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.year_month == prev_year_month).first()
    if current is None or previous is None:
        return None
    return current.savings_total - previous.savings_total


def list_history(db: Session, months: int = 12) -> list[NetWorthSnapshot]:
    rows = (
        db.query(NetWorthSnapshot)
        .order_by(NetWorthSnapshot.year_month.desc())
        .limit(months)
        .all()
    )
    return list(reversed(rows))
