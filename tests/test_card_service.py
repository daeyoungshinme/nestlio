from datetime import date
from decimal import Decimal

import pytest

from app.services import account_service, card_service, transaction_service
from app.services.card_service import CardNotFoundError, InvalidCardAccountError


def _expense(seeded_db, **kwargs):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    return transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("10000"),
        transaction_date=date(2026, 7, 5), **kwargs,
    )


def test_card_transaction_takes_account_and_payment_method_from_card(seeded_db):
    db = seeded_db["db"]
    bank = account_service.create_account(db, "월급통장", "bank", Decimal("100000"))
    other = account_service.create_account(db, "비상금통장", "bank", Decimal("0"))
    card = card_service.create_card(db, "신한카드", "debit", bank.id)

    tx = _expense(seeded_db, card_id=card.id, account_id=other.id, payment_method="cash")

    assert (tx.card_id, tx.account_id, tx.payment_method) == (card.id, bank.id, "debit_card")
    assert account_service.current_balance(db, bank) == Decimal("90000")


def test_credit_card_spending_is_deducted_on_use_date(seeded_db):
    db = seeded_db["db"]
    bank = account_service.create_account(db, "월급통장", "bank", Decimal("100000"))
    card = card_service.create_card(db, "현대카드", "credit", bank.id)

    tx = _expense(seeded_db, card_id=card.id)

    assert tx.payment_method == "credit_card"
    assert account_service.current_balance(db, bank) == Decimal("90000")


def test_card_without_payment_account_leaves_account_empty(seeded_db):
    card = card_service.create_card(seeded_db["db"], "옮겨온카드", "credit", None)

    tx = _expense(seeded_db, card_id=card.id)

    assert (tx.card_id, tx.account_id) == (card.id, None)


def test_inactive_or_missing_card_is_rejected_for_new_transaction(seeded_db):
    db = seeded_db["db"]
    card = card_service.create_card(db, "해지카드", "credit", None)
    card_service.deactivate_card(db, card.id)

    with pytest.raises(CardNotFoundError):
        _expense(seeded_db, card_id=card.id)
    with pytest.raises(CardNotFoundError):
        _expense(seeded_db, card_id=999)


def test_update_with_same_card_keeps_stored_account_after_card_account_changes(seeded_db):
    db = seeded_db["db"]
    old_bank = account_service.create_account(db, "예전통장", "bank", Decimal("0"))
    new_bank = account_service.create_account(db, "새통장", "bank", Decimal("0"))
    card = card_service.create_card(db, "신한카드", "debit", old_bank.id)
    tx = _expense(seeded_db, card_id=card.id)
    card_service.update_card(db, card.id, "신한카드", "debit", new_bank.id)
    card_service.deactivate_card(db, card.id)

    updated = transaction_service.update_transaction(
        db, tx.id, description="메모만 수정", card_id=card.id, account_id=None, payment_method=None
    )

    assert (updated.account_id, updated.payment_method, updated.description) == (old_bank.id, "debit_card", "메모만 수정")


def test_update_to_another_card_takes_its_account(seeded_db):
    db = seeded_db["db"]
    bank_a = account_service.create_account(db, "통장A", "bank", Decimal("0"))
    bank_b = account_service.create_account(db, "통장B", "bank", Decimal("0"))
    card_a = card_service.create_card(db, "카드A", "debit", bank_a.id)
    card_b = card_service.create_card(db, "카드B", "credit", bank_b.id)
    tx = _expense(seeded_db, card_id=card_a.id)

    updated = transaction_service.update_transaction(db, tx.id, card_id=card_b.id, account_id=bank_a.id)

    assert (updated.account_id, updated.payment_method) == (bank_b.id, "credit_card")


def test_removing_card_from_transaction_uses_submitted_account(seeded_db):
    db = seeded_db["db"]
    bank = account_service.create_account(db, "통장", "bank", Decimal("0"))
    card = card_service.create_card(db, "카드", "debit", bank.id)
    tx = _expense(seeded_db, card_id=card.id)

    updated = transaction_service.update_transaction(db, tx.id, card_id=None, account_id=None, payment_method="cash")

    assert (updated.card_id, updated.account_id, updated.payment_method) == (None, None, "cash")


def test_payment_account_must_be_active(seeded_db):
    db = seeded_db["db"]
    bank = account_service.create_account(db, "닫은통장", "bank", Decimal("0"))
    account_service.deactivate_account(db, bank.id)

    with pytest.raises(InvalidCardAccountError):
        card_service.create_card(db, "카드", "credit", bank.id)
    with pytest.raises(InvalidCardAccountError):
        card_service.create_card(db, "카드", "credit", 999)


def test_apply_to_unlinked_fills_only_transactions_without_account(seeded_db):
    db = seeded_db["db"]
    other = account_service.create_account(db, "다른통장", "bank", Decimal("0"))
    bank = account_service.create_account(db, "결제통장", "bank", Decimal("0"))
    card = card_service.create_card(db, "옮겨온카드", "credit", None)
    unlinked = _expense(seeded_db, card_id=card.id)
    card_service.update_card(db, card.id, "옮겨온카드", "credit", other.id)
    linked = _expense(seeded_db, card_id=card.id)

    assert card_service.list_with_usage(db)[0]["unlinked_transaction_count"] == 1
    card_service.update_card(db, card.id, "옮겨온카드", "credit", bank.id, apply_to_unlinked=True)

    db.refresh(unlinked)
    db.refresh(linked)
    assert (unlinked.account_id, linked.account_id) == (bank.id, other.id)
    assert card_service.list_with_usage(db)[0]["unlinked_transaction_count"] == 0


def test_update_without_apply_to_unlinked_leaves_old_transactions(seeded_db):
    db = seeded_db["db"]
    bank = account_service.create_account(db, "결제통장", "bank", Decimal("0"))
    card = card_service.create_card(db, "옮겨온카드", "credit", None)
    tx = _expense(seeded_db, card_id=card.id)

    card_service.update_card(db, card.id, "옮겨온카드", "credit", bank.id)

    db.refresh(tx)
    assert tx.account_id is None


def test_list_excludes_deactivated_cards(seeded_db):
    db = seeded_db["db"]
    kept = card_service.create_card(db, "쓰는카드", "debit", None)
    gone = card_service.create_card(db, "해지카드", "credit", None)
    card_service.deactivate_card(db, gone.id)

    assert [row["card"].id for row in card_service.list_with_usage(db)] == [kept.id]
    assert card_service.deactivate_card(db, 999) is False
