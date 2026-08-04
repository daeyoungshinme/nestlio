from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.services import savings_product_service
from app.services.growlio_client import GrowlioNotConfiguredError


def test_create_product_defaults_to_savings_type(db_session):
    product = savings_product_service.create_product(
        db_session, "적금", Decimal("100000"), Decimal("50000")
    )

    assert product.product_type == "savings"


def test_create_product_with_explicit_investment_type(db_session):
    product = savings_product_service.create_product(
        db_session, "펀드", Decimal("0"), Decimal("0"), product_type="investment"
    )

    assert product.product_type == "investment"


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
