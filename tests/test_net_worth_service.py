from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.services import account_service, loan_service, net_worth_service, savings_product_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError


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


def test_compute_growlio_unlinked_excludes_linked_and_sums_by_category(seeded_db):
    db = seeded_db["db"]
    linked_account = account_service.create_account(db, "월급통장", "bank", Decimal("0"))
    linked_account.growlio_account_id = "growlio-bank-1"
    linked_product = savings_product_service.create_product(
        db, "적금", Decimal("0"), Decimal("0"), "investment"
    )
    linked_product.growlio_account_id = "growlio-inv-1"
    db.commit()

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-bank-1", "name": "연동됨", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100.0},
                {"id": "growlio-bank-2", "name": "미연동 은행", "asset_type": "BANK_ACCOUNT", "current_value_krw": 200000.0},
                {"id": "growlio-inv-1", "name": "연동됨", "asset_type": "STOCK_KIS", "current_value_krw": 300.0},
                {"id": "growlio-inv-2", "name": "미연동 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 400000.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[
                {
                    "id": "growlio-re-1",
                    "name": "미연동 부동산",
                    "market_value_krw": 5000000.0,
                    "mortgage_balance_krw": 1000000.0,
                },
            ],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["bank_total"] == Decimal("200000")
    assert breakdown["investment_total"] == Decimal("400000")
    assert breakdown["real_estate_total"] == Decimal("5000000")
    assert breakdown["real_estate_loan_total"] == Decimal("1000000")
    assert breakdown["net_total"] == Decimal("4600000")
    assert breakdown["item_count"] == 3


def test_compute_growlio_unlinked_does_not_double_count_real_estate(seeded_db):
    db = seeded_db["db"]

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-re-1", "name": "부동산", "asset_type": "REAL_ESTATE", "current_value_krw": 4000000.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[
                {"id": "growlio-re-1", "name": "부동산", "market_value_krw": 5000000.0, "mortgage_balance_krw": 0},
            ],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["bank_total"] == Decimal("0")
    assert breakdown["investment_total"] == Decimal("0")
    assert breakdown["real_estate_total"] == Decimal("5000000")
    assert breakdown["item_count"] == 1


def test_compute_growlio_unlinked_returns_zero_when_everything_already_linked(seeded_db):
    db = seeded_db["db"]
    linked_account = account_service.create_account(db, "월급통장", "bank", Decimal("0"))
    linked_account.growlio_account_id = "growlio-bank-1"
    db.commit()

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-bank-1", "name": "연동됨", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0


def test_compute_growlio_unlinked_returns_zero_when_growlio_unreachable(seeded_db):
    db = seeded_db["db"]

    with patch(
        "app.services.net_worth_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0


def test_compute_growlio_unlinked_returns_zero_when_not_configured(seeded_db):
    db = seeded_db["db"]

    with patch(
        "app.services.net_worth_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0
