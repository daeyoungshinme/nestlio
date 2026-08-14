import uuid
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


def test_create_and_update_account_owner_user_id(db_session):
    owner_id = uuid.uuid4()
    account = account_service.create_account(db_session, "주거래통장", "bank", Decimal("0"), owner_id)

    assert account.owner_user_id == owner_id

    updated = account_service.update_account(db_session, account.id, "주거래통장", "bank", Decimal("0"), None)

    assert updated.owner_user_id is None


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


def test_sync_all_accounts_without_linked_accounts_returns_empty(db_session):
    account_service.create_account(db_session, "지갑", "cash", Decimal("0"))

    synced_count, failed = account_service.sync_all_accounts(db_session, "token", now=datetime(2026, 8, 11))

    assert synced_count == 0
    assert failed == []


def test_sync_all_accounts_syncs_every_linked_account_in_one_growlio_call(db_session):
    a1 = account_service.create_account(db_session, "월급통장", "bank", Decimal("0"))
    a1.growlio_account_id = "growlio-acc-1"
    a2 = account_service.create_account(db_session, "비상금통장", "bank", Decimal("0"))
    a2.growlio_account_id = "growlio-acc-2"
    db_session.commit()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "월급통장", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100000.0},
            {"id": "growlio-acc-2", "name": "비상금통장", "asset_type": "BANK_ACCOUNT", "current_value_krw": 200000.0},
        ],
    ) as mock_fetch:
        synced_count, failed = account_service.sync_all_accounts(db_session, "token", now=datetime(2026, 8, 11, 9, 0))

    mock_fetch.assert_called_once()
    assert synced_count == 2
    assert failed == []
    assert account_service.current_balance(db_session, a1) == Decimal("100000.0")
    assert account_service.current_balance(db_session, a2) == Decimal("200000.0")
    assert a1.last_synced_at == datetime(2026, 8, 11, 9, 0)
    assert a2.last_synced_at == datetime(2026, 8, 11, 9, 0)


def test_sync_all_accounts_reports_unmatched_accounts_without_raising(db_session):
    """배우자 소유 등으로 요청자 자신의 growlio 토큰에는 안 걸리는 계좌는 예외 없이 failed로만 담긴다."""
    matched = account_service.create_account(db_session, "월급통장", "bank", Decimal("0"))
    matched.growlio_account_id = "growlio-acc-1"
    unmatched = account_service.create_account(db_session, "배우자계좌", "bank", Decimal("0"))
    unmatched.growlio_account_id = "growlio-acc-spouse"
    db_session.commit()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "월급통장", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100000.0},
        ],
    ):
        synced_count, failed = account_service.sync_all_accounts(db_session, "token", now=datetime(2026, 8, 11))

    assert synced_count == 1
    assert len(failed) == 1
    assert failed[0]["id"] == unmatched.id
    assert failed[0]["name"] == "배우자계좌"


def test_sync_all_accounts_propagates_not_configured_error(db_session):
    account = account_service.create_account(db_session, "월급통장", "bank", Decimal("0"))
    account.growlio_account_id = "growlio-acc-1"
    db_session.commit()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            account_service.sync_all_accounts(db_session, "token", now=datetime(2026, 8, 11))
