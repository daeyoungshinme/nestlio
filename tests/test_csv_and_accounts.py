from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from sqlalchemy.exc import SQLAlchemyError

from app.services import account_service, transaction_import_service, transaction_report_service, transaction_service
from app.services.google_auth import GoogleNotConnectedError
from app.services.google_sheets_service import GoogleSheetsReadError
from app.services.growlio_client import GrowlioNotConfiguredError


def test_export_csv_round_trips_through_import(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("12000"), date(2026, 7, 5), description="점심")
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("3000000"), date(2026, 7, 1), description="월급")

    transactions = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    csv_text = transaction_import_service.export_csv(transactions)

    assert "점심" in csv_text
    assert "지출" in csv_text and "수입" in csv_text

    # wipe and re-import to prove the exported format is importable
    for tx in transactions:
        transaction_service.delete_transaction(db, tx.id)
    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert result["skipped"] == []
    reimported = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    assert len(reimported) == 2


def test_import_csv_returns_created_ids_for_undo(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,10000,점심\n"
        "2026-07-06,지출,식비,5000,저녁\n"
    )

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert len(result["created_ids"]) == 2
    created = {tx.id for tx in transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))}
    assert set(result["created_ids"]) == created


def test_import_csv_skips_unknown_category_and_reports_reason(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,없는카테고리,10000,test\n"

    result = transaction_import_service.import_csv(db, csv_text, user.id)

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

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["line"] == 1


def test_import_row_db_error_is_isolated_and_does_not_abort_whole_import(seeded_db):
    """한 행의 db.flush()가 DB 오류(정밀도 초과 등)를 내도 SAVEPOINT 롤백으로 그 행만 skip하고
    나머지 행과 최종 commit은 정상 진행된다 — 예전에는 세션이 오염돼 import 전체가 실패했다."""
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,10000,boom\n"
        "2026-07-06,지출,식비,5000,ok\n"
    )
    real_flush = db.flush

    def flaky_flush(*args, **kwargs):
        # "boom" 행을 flush할 때만 DB 오류를 시뮬레이션한다 (정밀도 초과 등을 흉내).
        if any(getattr(obj, "description", None) == "boom" for obj in db.new):
            raise SQLAlchemyError("simulated data error")
        return real_flush(*args, **kwargs)

    with patch.object(db, "flush", side_effect=flaky_flush):
        result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert len(result["skipped"]) == 1
    assert "simulated data error" in result["skipped"][0]["reason"]
    reimported = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    assert [tx.description for tx in reimported] == ["ok"]


def test_import_from_sheet_url_reads_public_csv_and_delegates_to_import_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,식비,10000,점심\n"

    with patch(
        "app.services.google_sheets_service.read_public_csv",
        return_value=csv_text,
    ) as mocked:
        result = transaction_import_service.import_from_sheet_url(db, "https://docs.google.com/spreadsheets/d/abc123/edit", user.id)

    mocked.assert_called_once_with("https://docs.google.com/spreadsheets/d/abc123/edit")
    assert result["created"] == 1
    assert result["skipped"] == []


def test_import_from_sheet_url_propagates_read_error(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.google_sheets_service.read_public_csv",
        side_effect=GoogleSheetsReadError("시트가 비공개 상태입니다."),
    ):
        with pytest.raises(GoogleSheetsReadError):
            transaction_import_service.import_from_sheet_url(db, "https://docs.google.com/spreadsheets/d/abc123/edit", user.id)


def test_import_from_spreadsheet_requires_google_connection(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch("app.services.google_auth.is_connected", return_value=False):
        with pytest.raises(GoogleNotConnectedError):
            transaction_import_service.import_from_spreadsheet(db, "abc123", None, user.id)


def test_import_from_spreadsheet_reads_values_and_delegates_to_import_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    rows = [
        ["날짜", "구분", "카테고리", "금액", "메모"],
        ["2026-07-05", "지출", "식비", "10000", "점심"],
    ]

    with (
        patch("app.services.google_auth.is_connected", return_value=True),
        patch("app.services.google_sheets_service.read_values", return_value=rows) as mocked,
    ):
        result = transaction_import_service.import_from_spreadsheet(db, "abc123", "1월", user.id)

    mocked.assert_called_once_with("abc123", "1월")
    assert result["created"] == 1
    assert result["skipped"] == []


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

    monthly = transaction_report_service.yearly_monthly_breakdown(db, 2026)

    assert len(monthly) == 12
    assert [row["year_month"] for row in monthly] == [f"2026-{m:02d}" for m in range(1, 13)]
    assert monthly[2]["expense"] == Decimal("800000")  # March
    assert monthly[10]["expense"] == Decimal("800000")  # November
    assert monthly[0]["expense"] == Decimal("0")  # January untouched


def test_list_growlio_bank_accounts_filters_to_bank_type_only(seeded_db):
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        accounts = account_service.list_growlio_bank_accounts("token")

    assert [a["id"] for a in accounts] == ["growlio-acc-1"]


def test_import_from_growlio_creates_one_account_per_bank_account(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        created = account_service.import_from_growlio(db, ["growlio-acc-1", "growlio-acc-2"], "token", user.id)

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-1"
    assert created[0].account_type == "bank"
    assert created[0].initial_balance == Decimal("1500000.0")
    # 가져오기를 실행한 사람 = 그 growlio 계정의 실제 소유자
    assert created[0].owner_user_id == user.id


def test_import_from_growlio_skips_already_linked_accounts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    account_service.create_account(db, "기존계좌", "bank", Decimal("0"))
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0}],
    ):
        first = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)
        second = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)

    assert len(first) == 1
    assert len(second) == 0


def test_import_from_growlio_propagates_not_configured_error(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)


def test_deactivate_account_clears_growlio_link(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0}],
    ):
        created = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)
    account = created[0]

    account_service.deactivate_account(db, account.id)
    db.refresh(account)

    assert account.is_active is False
    assert account.growlio_account_id is None


def test_yearly_totals_excludes_other_years(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 6, 1))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("500000"), date(2025, 12, 31))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("500000"), date(2027, 1, 1))

    totals = transaction_report_service.yearly_totals(db, 2026)

    assert totals["expense"] == Decimal("800000")
