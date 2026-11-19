"""growlio 연결 정합성 — 같은 계좌의 중복 연결, 출금 반영 계좌, 비활성 항목에 새 거래."""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.account import Account
from app.models.category import Category
from app.models.growlio_push_queue import GrowlioPushQueue
from app.models.savings_product import SavingsProduct
from app.services import (
    account_service,
    growlio_client,
    savings_product_growlio_service,
    savings_product_service,
    transaction_service,
)
from app.services.transaction_service import InvalidTransactionReferenceError

NOW = datetime(2026, 11, 19, 9, 0)


def test_account_import_with_duplicate_ids_creates_one(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "g-1", "name": "국민은행", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0}],
    ):
        created = account_service.import_from_growlio(db, ["g-1", "g-1"], "token", user.id)
    assert len(created) == 1
    assert db.query(Account).filter(Account.growlio_account_id == "g-1").count() == 1


def test_product_import_with_duplicate_ids_creates_one(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.savings_product_growlio_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "g-2", "name": "ETF", "asset_type": "STOCK_KIWOOM", "current_value_krw": 1000.0}],
    ):
        created = savings_product_growlio_service.import_from_growlio(db, ["g-2", "g-2"], "token", user.id, now=NOW)
    assert len(created) == 1


def test_concurrent_duplicate_link_is_conflict_not_500(seeded_db):
    """사전 검사를 둘 다 통과한 동시 요청 — 활성 연결 유니크 인덱스가 막고 409로 바뀐다."""
    db = seeded_db["db"]
    db.add(SavingsProduct(name="A", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"), growlio_account_id="g-3"))
    db.commit()
    db.add(SavingsProduct(name="B", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"), growlio_account_id="g-3"))
    with pytest.raises(growlio_client.GrowlioAccountAlreadyLinkedError):
        growlio_client.commit_growlio_links(db)
    assert db.query(SavingsProduct).count() == 1


def test_inactive_rows_may_share_a_growlio_account(seeded_db):
    db = seeded_db["db"]
    db.add_all(
        [
            Account(name="옛", account_type="bank", initial_balance=Decimal("0"), growlio_account_id="g-4", is_active=False),
            Account(name="새", account_type="bank", initial_balance=Decimal("0"), growlio_account_id="g-4"),
        ]
    )
    growlio_client.commit_growlio_links(db)
    assert db.query(Account).count() == 2


def _savings(db, growlio_account_id="g-5"):
    category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    product = SavingsProduct(
        name="ETF", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"), growlio_account_id=growlio_account_id
    )
    db.add_all([category, product])
    db.commit()
    return category, product


def _deposit(db, user, category, product):
    return transaction_service.create_transaction(
        db, user_id=user.id, category_id=category.id, type_="expense", amount=Decimal("300000"),
        transaction_date=date(2026, 11, 1), savings_product_id=product.id,
    )


def test_withdrawal_goes_to_the_account_the_deposit_was_sent_to(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    category, product = _savings(db)
    tx = _deposit(db, user, category, product)
    savings_product_service.set_growlio_link(db, product.id, "g-6", auto_sync_enabled=True)

    transaction_service.delete_transaction(db, tx.id)

    rows = db.query(GrowlioPushQueue).order_by(GrowlioPushQueue.id).all()
    assert [(r.transaction_type, r.growlio_account_id) for r in rows] == [("DEPOSIT", "g-5"), ("WITHDRAWAL", "g-5")]


def test_withdrawal_without_queue_record_uses_current_link(seeded_db):
    """아웃박스 이전에 직접 보낸 입금은 큐 기록이 없다 — 지금 연동된 계좌에서 뺀다(기존 동작)."""
    db, user = seeded_db["db"], seeded_db["user"]
    category, product = _savings(db)
    tx = _deposit(db, user, category, product)
    db.query(GrowlioPushQueue).delete()
    db.commit()

    transaction_service.delete_transaction(db, tx.id)

    rows = db.query(GrowlioPushQueue).all()
    assert [(r.transaction_type, r.growlio_account_id) for r in rows] == [("WITHDRAWAL", "g-5")]


def test_new_transaction_rejects_inactive_product_and_account(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    category, product = _savings(db, growlio_account_id=None)
    account = Account(name="닫은 통장", account_type="bank", initial_balance=Decimal("0"), is_active=False)
    product.is_active = False
    db.add(account)
    db.commit()
    with pytest.raises(InvalidTransactionReferenceError):
        _deposit(db, user, category, product)
    with pytest.raises(InvalidTransactionReferenceError):
        transaction_service.create_transaction(
            db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("1000"),
            transaction_date=date(2026, 11, 1), account_id=account.id,
        )


def test_editing_old_transaction_keeps_inactive_account(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    account = Account(name="통장", account_type="bank", initial_balance=Decimal("0"))
    db.add(account)
    db.commit()
    tx = transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("1000"),
        transaction_date=date(2026, 11, 1), account_id=account.id,
    )
    account.is_active = False
    db.commit()

    updated = transaction_service.update_transaction(db, tx.id, description="메모", account_id=account.id)
    assert updated.description == "메모"
