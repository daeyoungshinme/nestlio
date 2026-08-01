from datetime import date
from decimal import Decimal

from app.services import account_service, transaction_service


def test_export_csv_round_trips_through_import(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("12000"), date(2026, 7, 5), description="점심")
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("3000000"), date(2026, 7, 1), description="월급")

    transactions = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    csv_text = transaction_service.export_csv(transactions)

    assert "점심" in csv_text
    assert "지출" in csv_text and "수입" in csv_text

    # wipe and re-import to prove the exported format is importable
    for tx in transactions:
        transaction_service.delete_transaction(db, tx.id)
    result = transaction_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert result["skipped"] == []
    reimported = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    assert len(reimported) == 2


def test_import_csv_skips_unknown_category_and_reports_reason(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,없는카테고리,10000,test\n"

    result = transaction_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 0
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["line"] == 1


def test_import_csv_skips_malformed_amount_but_keeps_valid_rows(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,not-a-number,broken\n"
        "2026-07-06,지출,식비,5000,ok\n"
    )

    result = transaction_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["line"] == 1


def test_account_balance_reflects_initial_balance_plus_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    account = account_service.create_account(db, "현금", "cash", Decimal("100000"))

    tx1 = transaction_service.create_transaction(
        db, user.id, food.id, "income", Decimal("50000"), date(2026, 7, 1), account_id=account.id
    )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("20000"), date(2026, 7, 2), account_id=account.id
    )
    # a transaction on a *different* account (or no account) must not affect this balance
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("999999"), date(2026, 7, 3))

    balance = account_service.current_balance(db, account)

    assert balance == Decimal("130000")  # 100000 + 50000 - 20000


def test_deactivated_account_excluded_from_active_listing(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "카드", "card", Decimal("0"))

    account_service.deactivate_account(db, account.id)

    assert account.id not in [a.id for a in account_service.list_accounts(db, active_only=True)]
    assert account.id in [a.id for a in account_service.list_accounts(db, active_only=False)]


def test_yearly_monthly_breakdown_covers_all_twelve_months_in_order(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 3, 1))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 11, 1))

    monthly = transaction_service.yearly_monthly_breakdown(db, 2026)

    assert len(monthly) == 12
    assert [row["year_month"] for row in monthly] == [f"2026-{m:02d}" for m in range(1, 13)]
    assert monthly[2]["expense"] == Decimal("800000")  # March
    assert monthly[10]["expense"] == Decimal("800000")  # November
    assert monthly[0]["expense"] == Decimal("0")  # January untouched


def test_yearly_totals_excludes_other_years(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 6, 1))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("500000"), date(2025, 12, 31))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("500000"), date(2027, 1, 1))

    totals = transaction_service.yearly_totals(db, 2026)

    assert totals["expense"] == Decimal("800000")
