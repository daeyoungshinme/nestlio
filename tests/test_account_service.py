from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.services import account_service, transaction_service
from app.services.growlio_client import GrowlioNotConfiguredError


def test_sync_account_without_link_raises(db_session):
    account = account_service.create_account(db_session, "주거래통장", "bank", Decimal("0"))

    with pytest.raises(account_service.GrowlioSyncError):
        account_service.sync_account(db_session, account.id, "token", now=datetime(2026, 8, 11))


def test_sync_account_reconciles_initial_balance_around_existing_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    account = account_service.create_account(db, "월급통장", "bank", Decimal("100000"))
    account.growlio_account_id = "growlio-acc-1"
    db.commit()
    transaction_service.create_transaction(
        db, user.id, food.id, "income", Decimal("50000"), date(2026, 7, 1), account_id=account.id
    )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("20000"), date(2026, 7, 2), account_id=account.id
    )
    # displayed balance before sync: 100000 + 50000 - 20000 = 130000

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 999000.0},
        ],
    ):
        synced = account_service.sync_account(db, account.id, "token", now=datetime(2026, 8, 11, 9, 0))

    assert synced is not None
    assert synced.last_synced_at == datetime(2026, 8, 11, 9, 0)
    assert account_service.current_balance(db, synced) == Decimal("999000.0")


def test_sync_account_no_matching_growlio_account_raises(db_session):
    account = account_service.create_account(db_session, "월급통장", "bank", Decimal("0"))
    account.growlio_account_id = "growlio-acc-missing"
    db_session.commit()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "다른 계좌", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0},
        ],
    ):
        with pytest.raises(account_service.GrowlioSyncError):
            account_service.sync_account(db_session, account.id, "token", now=datetime(2026, 8, 11))


def test_sync_account_propagates_not_configured_error(db_session):
    account = account_service.create_account(db_session, "월급통장", "bank", Decimal("0"))
    account.growlio_account_id = "growlio-acc-1"
    db_session.commit()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            account_service.sync_account(db_session, account.id, "token", now=datetime(2026, 8, 11))
