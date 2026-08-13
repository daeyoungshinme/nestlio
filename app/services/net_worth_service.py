import logging
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.savings_product import SavingsProduct
from app.services import account_service, growlio_client, loan_service, savings_product_service
from app.utils.dates import parse_year_month, shift_month, year_month_str

logger = logging.getLogger(__name__)


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


def compute_growlio_unlinked(db: Session, bearer_token: str) -> dict:
    """growlio에는 있지만 아직 nestlio로 가져오지 않은 자산의 합계를 조회한다.

    이미 연동된(=가져온) 자산은 로컬 net_worth에 이미 잡히므로 제외한다. 대시보드에
    자동으로 뜨는 보조 위젯이므로, growlio가 설정되지 않았거나(GrowlioNotConfiguredError)
    요청이 실패해도(GrowlioRequestError, 예: growlio가 잠들어있음) 절대 실패시키지 않고
    조용히 0건으로 처리한다 (transaction_service.push_savings_transaction_to_growlio와 동일한 방침).
    """
    try:
        accounts = growlio_client.fetch_account_balances(bearer_token)
        real_estate_items = growlio_client.fetch_real_estate_items(bearer_token)
    except (growlio_client.GrowlioNotConfiguredError, growlio_client.GrowlioRequestError):
        logger.warning("growlio_unlinked_fetch_failed", exc_info=True)
        accounts, real_estate_items = [], []

    linked_account_ids = growlio_client.already_linked_growlio_ids(db, Account)
    linked_product_ids = growlio_client.already_linked_growlio_ids(db, SavingsProduct)

    bank_total = Decimal("0")
    investment_total = Decimal("0")
    item_count = 0
    for account in accounts:
        if account["id"] in linked_account_ids or account["id"] in linked_product_ids:
            continue
        if account["asset_type"] in growlio_client.BANK_ASSET_TYPES:
            bank_total += growlio_client.to_decimal_krw(account["current_value_krw"])
            item_count += 1
        elif account["asset_type"] in growlio_client.INVESTMENT_ASSET_TYPES:
            investment_total += growlio_client.to_decimal_krw(account["current_value_krw"])
            item_count += 1
        # REAL_ESTATE_ASSET_TYPE은 담보대출을 뺀 순액만 담겨 있어(fetch_real_estate_items와
        # 중복 집계되므로) 여기서는 건너뛰고 아래 real estate 루프에서만 집계한다.

    real_estate_total = Decimal("0")
    real_estate_loan_total = Decimal("0")
    for item in real_estate_items:
        if item["id"] in linked_product_ids:
            continue
        real_estate_total += growlio_client.to_decimal_krw(item["market_value_krw"])
        real_estate_loan_total += growlio_client.to_decimal_krw(item.get("mortgage_balance_krw") or 0)
        item_count += 1

    net_total = bank_total + investment_total + real_estate_total - real_estate_loan_total
    return {
        "bank_total": bank_total,
        "investment_total": investment_total,
        "real_estate_total": real_estate_total,
        "real_estate_loan_total": real_estate_loan_total,
        "net_total": net_total,
        "item_count": item_count,
    }


def list_history(db: Session, months: int = 12) -> list[NetWorthSnapshot]:
    rows = (
        db.query(NetWorthSnapshot)
        .order_by(NetWorthSnapshot.year_month.desc())
        .limit(months)
        .all()
    )
    return list(reversed(rows))
