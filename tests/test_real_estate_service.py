from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.loan import Loan
from app.services import real_estate_service
from app.services.growlio_client import GrowlioNotConfiguredError

_GROWLIO_ITEM = {
    "id": "growlio-re-1",
    "name": "우리집",
    "address": "서울시 강남구",
    "property_type": "아파트",
    "market_value_krw": 800000000.0,
    "mortgage_balance_krw": 300000000.0,
    "net_equity_krw": 500000000.0,
    "purchase_price_krw": 700000000.0,
    "purchase_date": "2020-01-01",
    "as_of": None,
}


def _patch_fetch(items):
    return patch("app.services.real_estate_service.growlio_client.fetch_real_estate_items", return_value=items)


def test_import_creates_real_estate_product_and_linked_loan(db_session):
    with _patch_fetch([_GROWLIO_ITEM]):
        created = real_estate_service.import_from_growlio(
            db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11, 9, 0)
        )

    assert len(created) == 1
    product, loan = created[0]
    assert product.product_type == "real_estate"
    assert product.current_balance == Decimal("800000000.0")
    assert product.principal_amount == Decimal("700000000.0")
    assert product.growlio_account_id == "growlio-re-1"
    assert product.auto_sync_enabled is True

    assert loan is not None
    assert loan.name == "우리집 담보대출"
    assert loan.balance == Decimal("300000000.0")
    assert loan.growlio_account_id == "growlio-re-1"
    assert loan.auto_sync_enabled is True


def test_import_skips_loan_creation_when_no_mortgage(db_session):
    item = {**_GROWLIO_ITEM, "mortgage_balance_krw": 0.0}
    with _patch_fetch([item]):
        created = real_estate_service.import_from_growlio(
            db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11)
        )

    assert len(created) == 1
    product, loan = created[0]
    assert product.product_type == "real_estate"
    assert loan is None
    assert db_session.query(Loan).count() == 0


def test_import_skips_already_linked_products(db_session):
    with _patch_fetch([_GROWLIO_ITEM]):
        real_estate_service.import_from_growlio(db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11))
        created_again = real_estate_service.import_from_growlio(
            db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11)
        )

    assert created_again == []


def test_import_propagates_not_configured_error(db_session):
    with patch(
        "app.services.real_estate_service.growlio_client.fetch_real_estate_items",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            real_estate_service.import_from_growlio(db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11))


def test_sync_updates_both_product_and_linked_loan(db_session):
    with _patch_fetch([_GROWLIO_ITEM]):
        [(product, loan)] = real_estate_service.import_from_growlio(
            db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11)
        )

    updated_item = {
        **_GROWLIO_ITEM,
        "market_value_krw": 850000000.0,
        "mortgage_balance_krw": 280000000.0,
        "purchase_price_krw": 700000000.0,
    }
    with _patch_fetch([updated_item]):
        synced_product, synced_loan = real_estate_service.sync_from_growlio(
            db_session, product.id, "token", now=datetime(2026, 8, 12, 9, 0)
        )

    assert synced_product.current_balance == Decimal("850000000.0")
    assert synced_product.last_synced_at == datetime(2026, 8, 12, 9, 0)
    assert synced_loan is not None
    assert synced_loan.id == loan.id
    assert synced_loan.balance == Decimal("280000000.0")
    assert synced_loan.last_synced_at == datetime(2026, 8, 12, 9, 0)


def test_sync_without_link_raises(db_session):
    with _patch_fetch([_GROWLIO_ITEM]):
        from app.services import savings_product_service

        product = savings_product_service.create_product(db_session, "우리집", Decimal("0"), Decimal("0"))

        with pytest.raises(real_estate_service.GrowlioSyncError):
            real_estate_service.sync_from_growlio(db_session, product.id, "token", now=datetime(2026, 8, 11))


def test_sync_missing_product_returns_none(db_session):
    result = real_estate_service.sync_from_growlio(db_session, 999999, "token", now=datetime(2026, 8, 11))

    assert result is None


def test_sync_no_matching_growlio_account_raises(db_session):
    with _patch_fetch([_GROWLIO_ITEM]):
        [(product, _loan)] = real_estate_service.import_from_growlio(
            db_session, ["growlio-re-1"], "token", now=datetime(2026, 8, 11)
        )

    with _patch_fetch([]):
        with pytest.raises(real_estate_service.GrowlioSyncError):
            real_estate_service.sync_from_growlio(db_session, product.id, "token", now=datetime(2026, 8, 12))
