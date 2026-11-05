"""요청 바디로 들어온 참조·연결 상태 검증. 없는 id는 Postgres에서 IntegrityError(500)가 되므로 서비스에서 막는다."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.dependencies import get_current_user
from app.errors import InvalidInputError
from app.models.user import User
from app.services import (
    account_service,
    card_service,
    event_service,
    invite_service,
    transaction_service,
    user_service,
)

NOW = datetime(2026, 7, 1, 9, 0)


def _expense(seeded_db, **kw):
    return transaction_service.create_transaction(
        seeded_db["db"],
        user_id=seeded_db["user"].id,
        category_id=seeded_db["food"].id,
        type_="expense",
        amount=Decimal("1000"),
        transaction_date=date(2026, 7, 1),
        **kw,
    )


# --- 계좌를 비활성화하면 카드 연결을 끊는다


def test_deactivating_account_unlinks_cards_so_new_transactions_stay_out_of_it(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "통장", "checking", Decimal("0"))
    card = card_service.create_card(db, "신한", "credit", account.id)

    assert account_service.deactivate_account(db, account.id) is True

    db.refresh(card)
    assert card.payment_account_id is None
    tx = _expense(seeded_db, card_id=card.id)
    assert tx.account_id is None  # 합산에서 빠지는 계좌로 들어가지 않는다


def test_deactivating_account_keeps_past_transactions_on_it(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "통장", "checking", Decimal("0"))
    card = card_service.create_card(db, "신한", "credit", account.id)
    tx = _expense(seeded_db, card_id=card.id)

    account_service.deactivate_account(db, account.id)

    db.refresh(tx)
    assert tx.account_id == account.id  # 그 돈은 실제로 그 계좌에서 나갔다


def test_card_can_be_renamed_after_its_account_was_deactivated(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "통장", "checking", Decimal("0"))
    card = card_service.create_card(db, "신한", "credit", account.id)
    account_service.deactivate_account(db, account.id)
    db.refresh(card)

    updated = card_service.update_card(db, card.id, "새 이름", "credit", card.payment_account_id)

    assert updated.name == "새 이름"


# --- 제거한 배우자를 다시 초대하면 복구한다


def _removed_spouse(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch("app.services.invite_service.is_connected", return_value=False):
        invite = invite_service.create_invite(db, user.id, "spouse@example.com", now=NOW)
    spouse_id = uuid.uuid4()
    spouse = invite_service.accept_invite(db, invite.token, spouse_id, "spouse@example.com", "배우자", now=NOW)
    user_service.remove_user(db, spouse, user, now=NOW)
    return spouse_id


@patch("app.services.invite_service.is_connected", return_value=False)
def test_reinvited_removed_spouse_is_restored_and_can_use_the_app(mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse_id = _removed_spouse(seeded_db)
    with pytest.raises(HTTPException) as blocked:
        get_current_user({"sub": str(spouse_id), "email": "spouse@example.com"}, db)
    assert blocked.value.status_code == 403

    invite = invite_service.create_invite(db, user.id, "spouse@example.com", now=NOW)
    restored = invite_service.accept_invite(db, invite.token, spouse_id, "spouse@example.com", "돌아온 배우자", now=NOW)

    assert restored.id == spouse_id
    assert restored.removed_at is None
    assert restored.removed_by_id is None
    assert restored.display_name == "돌아온 배우자"
    assert get_current_user({"sub": str(spouse_id), "email": "spouse@example.com"}, db).id == spouse_id
    assert {u.id for u in user_service.list_users(db)} == {user.id, spouse_id}


@patch("app.services.invite_service.is_connected", return_value=False)
def test_removed_spouse_cannot_be_restored_when_household_is_full(mock_connected, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse_id = _removed_spouse(seeded_db)
    invite = invite_service.create_invite(db, user.id, "spouse@example.com", now=NOW)
    db.add(User(id=uuid.uuid4(), email="new@example.com", display_name="새 배우자"))
    db.commit()

    with pytest.raises(invite_service.HouseholdFullError):
        invite_service.accept_invite(db, invite.token, spouse_id, "spouse@example.com", "배우자", now=NOW)

    db.refresh(invite)
    assert invite.accepted_at is None  # 초대가 소진되지 않는다
    assert db.get(User, spouse_id).removed_at is not None


# --- 없는 참조는 500이 아니라 400


@pytest.mark.parametrize(
    "field,value",
    [("account_id", 99999), ("owner_user_id", uuid.UUID(int=1))],
)
def test_create_transaction_rejects_missing_reference(seeded_db, field, value):
    with pytest.raises(InvalidInputError):
        _expense(seeded_db, **{field: value})


def test_create_transaction_rejects_missing_savings_product(seeded_db):
    from app.models.category import Category

    db, user = seeded_db["db"], seeded_db["user"]
    savings_cat = Category(name="저축", type="fixed", color="#000", sort_order=0, is_savings=True)
    db.add(savings_cat)
    db.commit()

    with pytest.raises(InvalidInputError):
        transaction_service.create_transaction(
            db, user_id=user.id, category_id=savings_cat.id, type_="expense", amount=Decimal("1000"),
            transaction_date=date(2026, 7, 1), savings_product_id=99999,
        )


def test_update_transaction_rejects_missing_reference(seeded_db):
    tx = _expense(seeded_db)

    with pytest.raises(InvalidInputError):
        transaction_service.update_transaction(seeded_db["db"], tx.id, account_id=99999)


def test_update_transaction_keeps_working_on_deactivated_account(seeded_db):
    """지난 거래는 비활성 계좌에 남아 있어도 고칠 수 있어야 한다."""
    db = seeded_db["db"]
    account = account_service.create_account(db, "통장", "checking", Decimal("0"))
    tx = _expense(seeded_db, account_id=account.id)
    account_service.deactivate_account(db, account.id)

    updated = transaction_service.update_transaction(db, tx.id, description="수정", account_id=account.id)

    assert updated.description == "수정"


def test_create_event_rejects_missing_or_removed_assignee(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse_id = _removed_spouse(seeded_db)

    for assignee_id in (uuid.UUID(int=1), spouse_id):
        with pytest.raises(event_service.EventAssigneeNotFoundError):
            event_service.create_event(db, user.id, "병원", datetime(2026, 7, 2, 9), assignee_id=assignee_id)


def test_update_event_keeps_already_removed_assignee_but_rejects_new_one(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse_id = _removed_spouse(seeded_db)
    event = event_service.create_event(db, user.id, "병원", datetime(2026, 7, 2, 9))
    event.assignee_id = spouse_id  # 제거되기 전에 지정해 둔 일정
    db.commit()

    assert event_service.update_event(db, event.id, title="치과", assignee_id=spouse_id).title == "치과"
    with pytest.raises(event_service.EventAssigneeNotFoundError):
        event_service.update_event(db, event.id, assignee_id=uuid.UUID(int=1))


def test_card_rejects_missing_owner_but_keeps_already_removed_one(seeded_db):
    db = seeded_db["db"]
    spouse_id = _removed_spouse(seeded_db)

    with pytest.raises(card_service.InvalidCardOwnerError):
        card_service.create_card(db, "신한", "credit", None, owner_user_id=uuid.UUID(int=1))

    card = card_service.create_card(db, "신한", "credit", None)
    card.owner_user_id = spouse_id
    db.commit()
    assert card_service.update_card(db, card.id, "이름", "credit", None, owner_user_id=spouse_id).name == "이름"
