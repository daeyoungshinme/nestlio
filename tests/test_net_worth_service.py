from datetime import date
from decimal import Decimal

from app.services import account_service, loan_service, net_worth_service, savings_product_service


def _seed_balances(db):
    account_service.create_account(db, "주거래통장", "bank", Decimal("1000000"))
    savings_product_service.create_product(db, "적금", Decimal("2000000"), Decimal("300000"))
    loan_service.create_loan(db, "신용대출", Decimal("500000"), Decimal("50000"), None, None, None, None)


def test_compute_current_aggregates_accounts_savings_loans(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    breakdown = net_worth_service.compute_current(db)

    assert breakdown["accounts_total"] == Decimal("1000000")
    assert breakdown["savings_total"] == Decimal("2000000")
    assert breakdown["loans_total"] == Decimal("500000")
    assert breakdown["net_worth"] == Decimal("2500000")


def test_record_snapshot_upserts_by_month(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    first = net_worth_service.record_snapshot(db, today=date(2026, 7, 1))
    assert first.year_month == "2026-07"
    assert first.net_worth == Decimal("2500000")

    savings_product_service.create_product(db, "예금", Decimal("1000000"), Decimal("0"))
    second = net_worth_service.record_snapshot(db, today=date(2026, 7, 15))

    history = net_worth_service.list_history(db)
    assert len(history) == 1
    assert second.id == first.id
    assert second.net_worth == Decimal("3500000")


def test_list_history_returns_ascending_order(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    net_worth_service.record_snapshot(db, today=date(2026, 5, 1))
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))

    history = net_worth_service.list_history(db, months=2)

    assert [row.year_month for row in history] == ["2026-06", "2026-07"]


def test_savings_delta_returns_change_between_consecutive_snapshots(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))  # savings_total = 2,000,000

    savings_product_service.create_product(db, "예금", Decimal("500000"), Decimal("0"))
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))  # savings_total = 2,500,000

    assert net_worth_service.savings_delta(db, "2026-07") == Decimal("500000")


def test_savings_delta_none_when_previous_snapshot_missing(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))

    assert net_worth_service.savings_delta(db, "2026-07") is None


def test_savings_delta_none_when_current_snapshot_missing(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))

    assert net_worth_service.savings_delta(db, "2026-07") is None
