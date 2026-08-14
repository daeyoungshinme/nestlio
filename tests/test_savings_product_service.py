import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.category import Category
from app.services import savings_product_service, transaction_service
from app.services.growlio_client import GrowlioNotConfiguredError

_OWNER_ID = uuid.uuid4()


def _add_savings_category(db):
    category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def test_create_product_defaults_to_savings_type(db_session):
    product = savings_product_service.create_product(
        db_session, "적금", Decimal("100000"), Decimal("50000")
    )

    assert product.product_type == "savings"
    assert product.owner_user_id is None


def test_create_and_update_product_owner_user_id(db_session):
    product = savings_product_service.create_product(
        db_session, "적금", Decimal("100000"), Decimal("50000"), owner_user_id=_OWNER_ID
    )

    assert product.owner_user_id == _OWNER_ID

    updated = savings_product_service.update_product(
        db_session, product.id, "적금", Decimal("100000"), Decimal("50000"), "savings", owner_user_id=None
    )

    assert updated.owner_user_id is None


def test_create_product_with_explicit_investment_type(db_session):
    product = savings_product_service.create_product(
        db_session, "펀드", Decimal("0"), Decimal("0"), product_type="investment"
    )

    assert product.product_type == "investment"


def test_create_product_with_principal_computes_return_rate(db_session):
    product = savings_product_service.create_product(
        db_session,
        "펀드",
        Decimal("1200000"),
        Decimal("0"),
        product_type="investment",
        principal_amount=Decimal("1000000"),
    )

    assert product.principal_amount == Decimal("1000000")
    assert product.return_amount == Decimal("200000")
    assert product.return_rate_pct == Decimal("20")


def test_return_rate_is_none_without_principal(db_session):
    product = savings_product_service.create_product(
        db_session, "펀드", Decimal("1200000"), Decimal("0"), product_type="investment"
    )

    assert product.return_amount is None
    assert product.return_rate_pct is None


def test_return_rate_is_none_for_savings_type_even_with_principal(db_session):
    product = savings_product_service.create_product(
        db_session, "적금", Decimal("1200000"), Decimal("0"), product_type="savings", principal_amount=Decimal("1000000")
    )

    assert product.return_rate_pct is None


def test_update_product_changes_type(db_session):
    product = savings_product_service.create_product(
        db_session, "적금", Decimal("0"), Decimal("0"), product_type="savings"
    )

    updated = savings_product_service.update_product(
        db_session, product.id, "주식", Decimal("0"), Decimal("0"), product_type="investment"
    )

    assert updated is not None
    assert updated.product_type == "investment"


def test_set_growlio_link_stores_account_id(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))

    linked = savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    assert linked is not None
    assert linked.growlio_account_id == "growlio-acc-1"
    assert linked.auto_sync_enabled is True


def test_set_growlio_link_clearing_id_resets_auto_sync_and_last_synced(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    cleared = savings_product_service.set_growlio_link(db_session, product.id, None, True)

    assert cleared is not None
    assert cleared.growlio_account_id is None
    assert cleared.auto_sync_enabled is False
    assert cleared.last_synced_at is None


def test_deactivate_product_clears_growlio_link(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    savings_product_service.deactivate_product(db_session, product.id)
    db_session.refresh(product)

    assert product.is_active is False
    assert product.growlio_account_id is None
    assert product.auto_sync_enabled is False
    assert product.last_synced_at is None


def test_sync_from_growlio_without_link_raises(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))

    with pytest.raises(savings_product_service.GrowlioSyncError):
        savings_product_service.sync_from_growlio(db_session, product.id, "token", now=datetime(2026, 8, 3))


def test_sync_from_growlio_updates_balance_from_matching_account(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("100"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
            {"id": "growlio-acc-2", "name": "다른 계좌", "asset_type": "STOCK_KIS", "current_value_krw": 999.0},
        ],
    ):
        synced = savings_product_service.sync_from_growlio(
            db_session, product.id, "token", now=datetime(2026, 8, 3, 9, 0)
        )

    assert synced is not None
    assert synced.current_balance == Decimal("1234500.0")
    assert synced.last_synced_at == datetime(2026, 8, 3, 9, 0)


def test_sync_from_growlio_no_matching_account_raises(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("100"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-missing", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "다른 계좌", "asset_type": "DEPOSIT", "current_value_krw": 1.0}],
    ):
        with pytest.raises(savings_product_service.GrowlioSyncError):
            savings_product_service.sync_from_growlio(db_session, product.id, "token", now=datetime(2026, 8, 3))


def test_sync_from_growlio_propagates_not_configured_error(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("100"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            savings_product_service.sync_from_growlio(db_session, product.id, "token", now=datetime(2026, 8, 3))


def test_sync_all_from_growlio_syncs_every_linked_product_in_one_growlio_call(db_session):
    p1 = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, p1.id, "growlio-acc-1", True)
    p2 = savings_product_service.create_product(db_session, "펀드", Decimal("0"), Decimal("0"), product_type="investment")
    savings_product_service.set_growlio_link(db_session, p2.id, "growlio-acc-2", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "적금", "asset_type": "DEPOSIT", "current_value_krw": 1000000.0},
            {"id": "growlio-acc-2", "name": "펀드", "asset_type": "STOCK_KIS", "current_value_krw": 2000000.0},
        ],
    ) as mock_fetch:
        synced_count, failed = savings_product_service.sync_all_from_growlio(
            db_session, "token", now=datetime(2026, 8, 6, 9, 0)
        )

    mock_fetch.assert_called_once()
    assert synced_count == 2
    assert failed == []
    assert p1.current_balance == Decimal("1000000.0")
    assert p2.current_balance == Decimal("2000000.0")


def test_sync_all_from_growlio_excludes_real_estate_products(db_session):
    product = savings_product_service.create_product(
        db_session, "아파트", Decimal("500000000"), Decimal("0"), product_type="real_estate"
    )
    product.growlio_account_id = "growlio-re-1"
    db_session.commit()

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances", return_value=[]
    ) as mock_fetch:
        synced_count, failed = savings_product_service.sync_all_from_growlio(db_session, "token", now=datetime(2026, 8, 6))

    mock_fetch.assert_not_called()
    assert synced_count == 0
    assert failed == []


def test_sync_all_from_growlio_reports_unmatched_products_without_raising(db_session):
    product = savings_product_service.create_product(db_session, "배우자적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-spouse", True)

    with patch("app.services.savings_product_service.growlio_client.fetch_account_balances", return_value=[]):
        synced_count, failed = savings_product_service.sync_all_from_growlio(db_session, "token", now=datetime(2026, 8, 6))

    assert synced_count == 0
    assert len(failed) == 1
    assert failed[0]["id"] == product.id


def test_sync_all_from_growlio_propagates_not_configured_error(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            savings_product_service.sync_all_from_growlio(db_session, "token", now=datetime(2026, 8, 6))


def test_list_growlio_accounts_excludes_bank_accounts(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
        ],
    ):
        accounts = savings_product_service.list_growlio_accounts("token")

    assert [a["id"] for a in accounts] == ["growlio-acc-2"]


def test_list_growlio_accounts_excludes_real_estate(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "강남 아파트", "asset_type": "REAL_ESTATE", "current_value_krw": 600000000.0},
            {"id": "growlio-acc-2", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
        ],
    ):
        accounts = savings_product_service.list_growlio_accounts("token")

    assert [a["id"] for a in accounts] == ["growlio-acc-2"]


def test_import_from_growlio_skips_real_estate(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "강남 아파트", "asset_type": "REAL_ESTATE", "current_value_krw": 600000000.0},
            {"id": "growlio-acc-2", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
        ],
    ):
        created = savings_product_service.import_from_growlio(
            db_session, ["growlio-acc-1", "growlio-acc-2"], "token", _OWNER_ID, now=datetime(2026, 8, 6)
        )

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-2"


def test_import_from_growlio_skips_bank_accounts(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
        ],
    ):
        created = savings_product_service.import_from_growlio(
            db_session, ["growlio-acc-1", "growlio-acc-2"], "token", _OWNER_ID, now=datetime(2026, 8, 6)
        )

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-2"


def test_import_from_growlio_creates_one_product_per_account_with_type_mapping(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        created = savings_product_service.import_from_growlio(
            db_session, ["growlio-acc-1", "growlio-acc-2"], "token", _OWNER_ID, now=datetime(2026, 8, 6, 9, 0)
        )

    assert len(created) == 2
    by_account = {p.growlio_account_id: p for p in created}
    assert by_account["growlio-acc-1"].product_type == "savings"
    assert by_account["growlio-acc-1"].current_balance == Decimal("1234500.0")
    assert by_account["growlio-acc-2"].product_type == "investment"
    assert by_account["growlio-acc-2"].current_balance == Decimal("5000000.0")
    for product in created:
        assert product.auto_sync_enabled is True
        assert product.last_synced_at == datetime(2026, 8, 6, 9, 0)
        # 가져오기를 실행한 사람 = 그 growlio 계정의 실제 소유자
        assert product.owner_user_id == _OWNER_ID


def test_import_from_growlio_skips_already_linked_accounts(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 2.0},
        ],
    ):
        created = savings_product_service.import_from_growlio(
            db_session, ["growlio-acc-1", "growlio-acc-2"], "token", _OWNER_ID, now=datetime(2026, 8, 6)
        )

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-2"


def test_import_from_growlio_reimports_account_after_link_deactivated(db_session):
    product = savings_product_service.create_product(db_session, "적금", Decimal("0"), Decimal("0"))
    savings_product_service.set_growlio_link(db_session, product.id, "growlio-acc-1", True)
    savings_product_service.deactivate_product(db_session, product.id)

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "일반계좌", "asset_type": "DEPOSIT", "current_value_krw": 3.0},
        ],
    ):
        created = savings_product_service.import_from_growlio(
            db_session, ["growlio-acc-1"], "token", _OWNER_ID, now=datetime(2026, 8, 6)
        )

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-1"


def test_actuals_for_month_sums_transactions_linked_to_product(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("30000"), date(2026, 7, 5), savings_product_id=product.id
    )
    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("20000"), date(2026, 7, 20), savings_product_id=product.id
    )

    actuals = savings_product_service.actuals_for_month(db, "2026-07")

    assert actuals[product.id] == Decimal("50000")


def test_actuals_for_month_excludes_other_months(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("30000"), date(2026, 7, 31), savings_product_id=product.id
    )
    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("40000"), date(2026, 8, 1), savings_product_id=product.id
    )

    actuals = savings_product_service.actuals_for_month(db, "2026-07")

    assert actuals[product.id] == Decimal("30000")


def test_actuals_for_month_excludes_unlinked_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1))

    actuals = savings_product_service.actuals_for_month(db, "2026-07")

    assert actuals == {}


def test_actuals_for_month_separates_multiple_products(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    savings_product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("0"))
    investment_product = savings_product_service.create_product(
        db, "펀드", Decimal("0"), Decimal("0"), product_type="investment"
    )

    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("30000"),
        date(2026, 7, 1),
        savings_product_id=savings_product.id,
    )
    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("70000"),
        date(2026, 7, 2),
        savings_product_id=investment_product.id,
    )

    actuals = savings_product_service.actuals_for_month(db, "2026-07")

    assert actuals[savings_product.id] == Decimal("30000")
    assert actuals[investment_product.id] == Decimal("70000")


def test_compute_plan_summary_matches_planned_and_actual_per_product(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))
    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("50000"), date(2026, 7, 1), savings_product_id=product.id
    )

    summary = savings_product_service.compute_plan_summary(db, "2026-07")

    item = next(i for i in summary["items"] if i["id"] == product.id)
    assert item["planned"] == Decimal("100000")
    assert item["actual"] == Decimal("50000")
    assert item["pct"] == 50.0
    assert summary["savings"]["planned"] == Decimal("100000")
    assert summary["savings"]["actual"] == Decimal("50000")


def test_compute_plan_summary_excludes_real_estate_products(seeded_db):
    db = seeded_db["db"]
    savings_product_service.create_product(
        db, "아파트", Decimal("500000000"), Decimal("0"), product_type="real_estate"
    )

    summary = savings_product_service.compute_plan_summary(db, "2026-07")

    assert summary["items"] == []
    assert summary["savings"]["pct"] is None
    assert summary["investment"]["pct"] is None


def test_actuals_for_year_sums_transactions_within_year(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("30000"), date(2026, 1, 5), savings_product_id=product.id
    )
    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("20000"), date(2026, 8, 20), savings_product_id=product.id
    )

    actuals = savings_product_service.actuals_for_year(db, 2026)

    assert actuals[product.id] == Decimal("50000")


def test_actuals_for_year_excludes_other_years(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("30000"), date(2026, 12, 31), savings_product_id=product.id
    )
    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("40000"), date(2027, 1, 1), savings_product_id=product.id
    )

    actuals = savings_product_service.actuals_for_year(db, 2026)

    assert actuals[product.id] == Decimal("30000")


def test_compute_annual_plan_summary_uses_elapsed_months_for_target_to_date(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    summary = savings_product_service.compute_annual_plan_summary(db, 2026, as_of=date(2026, 8, 15))

    item = next(i for i in summary["items"] if i["id"] == product.id)
    assert summary["elapsed_months"] == 8
    assert item["target_to_date"] == Decimal("800000")
    assert item["annual_target"] == Decimal("1200000")


def test_compute_annual_plan_summary_past_year_uses_full_12_months(seeded_db):
    db = seeded_db["db"]
    savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    summary = savings_product_service.compute_annual_plan_summary(db, 2025, as_of=date(2026, 8, 15))

    assert summary["elapsed_months"] == 12


def test_compute_annual_plan_summary_future_year_has_zero_elapsed_months(seeded_db):
    db = seeded_db["db"]
    savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    summary = savings_product_service.compute_annual_plan_summary(db, 2027, as_of=date(2026, 8, 15))

    assert summary["elapsed_months"] == 0
    assert summary["savings"]["target_to_date"] == Decimal("0")


def test_compute_annual_plan_summary_catches_up_after_a_skipped_month(seeded_db):
    """1월에 계획을 걸렀다가 2월에 2달치를 몰아 넣으면, 월별 뷰는 1월을 여전히 critical로 보지만
    연간 누적 뷰는 2월 시점에 계획대로 납입한 것으로(ok) 인정해야 한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = _add_savings_category(db)
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("100000"))

    transaction_service.create_transaction(
        db, user.id, savings_category.id, "expense", Decimal("200000"), date(2026, 2, 10), savings_product_id=product.id
    )

    monthly_summary = savings_product_service.compute_plan_summary(db, "2026-01")
    monthly_item = next(i for i in monthly_summary["items"] if i["id"] == product.id)
    assert monthly_item["status"] == "critical"

    annual_summary = savings_product_service.compute_annual_plan_summary(db, 2026, as_of=date(2026, 2, 20))
    annual_item = next(i for i in annual_summary["items"] if i["id"] == product.id)
    assert annual_item["target_to_date"] == Decimal("200000")
    assert annual_item["actual"] == Decimal("200000")
    assert annual_item["pct"] == 100.0
    assert annual_item["status"] == "ok"


def test_compute_annual_plan_summary_excludes_real_estate_products(seeded_db):
    db = seeded_db["db"]
    savings_product_service.create_product(
        db, "아파트", Decimal("500000000"), Decimal("0"), product_type="real_estate"
    )

    summary = savings_product_service.compute_annual_plan_summary(db, 2026, as_of=date(2026, 8, 15))

    assert summary["items"] == []
    assert summary["savings"]["pct"] is None
    assert summary["investment"]["pct"] is None


def test_import_from_growlio_propagates_not_configured_error(db_session):
    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            savings_product_service.import_from_growlio(db_session, ["growlio-acc-1"], "token", _OWNER_ID, now=datetime(2026, 8, 6))
