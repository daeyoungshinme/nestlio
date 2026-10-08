"""growlio_push_service — 저축·투자 거래의 growlio 입출금 반영 아웃박스."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from app.models.growlio_push_queue import GrowlioPushQueue
from app.models.savings_product import SavingsProduct
from app.models.user import User
from app.services import growlio_client, growlio_push_service

NOW = datetime(2026, 10, 8, 9, 0)


def _product(db, growlio_account_id="g-1", owner_user_id=None):
    product = SavingsProduct(
        name="ETF",
        current_balance=Decimal("0"),
        monthly_saving_amount=Decimal("0"),
        growlio_account_id=growlio_account_id,
        owner_user_id=owner_user_id,
    )
    db.add(product)
    db.commit()
    return product


def _push(db, product, token="token"):
    return growlio_push_service.push_now(
        db, product.id, "DEPOSIT", Decimal("300000"), date(2026, 10, 8), token, transaction_id=7
    )


def test_push_now_ignores_products_without_growlio_link(seeded_db):
    db = seeded_db["db"]
    product = _product(db, growlio_account_id=None)
    with patch.object(growlio_client, "push_transaction") as push:
        assert _push(db, product) is None
    push.assert_not_called()
    assert db.query(GrowlioPushQueue).count() == 0


def test_push_now_sends_with_queue_row_external_ref_and_marks_sent(seeded_db):
    db = seeded_db["db"]
    product = _product(db)
    with patch.object(growlio_client, "push_transaction") as push:
        assert _push(db, product) is True

    row = db.query(GrowlioPushQueue).one()
    push.assert_called_once_with(
        "token", "g-1", "DEPOSIT", Decimal("300000"), date(2026, 10, 8), external_ref=f"nestlio:q{row.id}"
    )
    assert row.sent_at is not None
    assert (row.transaction_id, row.attempts) == (7, 0)


def test_push_now_keeps_failed_row_pending(seeded_db):
    db = seeded_db["db"]
    product = _product(db)
    with patch.object(growlio_client, "push_transaction", side_effect=growlio_client.GrowlioRequestError("down")):
        assert _push(db, product) is False

    row = db.query(GrowlioPushQueue).one()
    assert row.sent_at is None
    assert row.attempts == 1
    assert row.last_error == "down"


def test_push_now_without_token_only_enqueues(seeded_db):
    db = seeded_db["db"]
    product = _product(db)
    with patch.object(growlio_client, "push_transaction") as push:
        assert _push(db, product, token=None) is False
    push.assert_not_called()
    assert db.query(GrowlioPushQueue).one().sent_at is None


def _flush(db, user_id):
    with patch("app.database.SessionLocal", return_value=db), patch.object(db, "close"):
        return growlio_push_service.flush_pending("token", user_id, now=NOW)


def test_flush_resends_own_and_shared_rows_with_same_ref_but_skips_spouse_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    mine = _product(db, "g-mine", owner_user_id=user.id)
    shared = _product(db, "g-shared")
    theirs = _product(db, "g-theirs", owner_user_id=spouse.id)
    for product in (mine, shared, theirs):
        _push(db, product, token=None)

    with patch.object(growlio_client, "push_transaction") as push:
        assert _flush(db, user.id) == 2

    sent_accounts = [c.args[1] for c in push.call_args_list]
    assert sent_accounts == ["g-mine", "g-shared"]
    rows = {r.growlio_account_id: r for r in db.query(GrowlioPushQueue).all()}
    assert push.call_args_list[0].kwargs["external_ref"] == f"nestlio:q{rows['g-mine'].id}"
    assert rows["g-mine"].sent_at == NOW and rows["g-shared"].sent_at == NOW
    assert rows["g-theirs"].sent_at is None


def test_flush_stops_at_first_failure_and_skips_rows_over_max_attempts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    product = _product(db)
    _push(db, product, token=None)
    _push(db, product, token=None)
    dead = _push(db, product, token=None)
    assert dead is False
    dead_row = db.query(GrowlioPushQueue).order_by(GrowlioPushQueue.id.desc()).first()
    dead_row.attempts = growlio_push_service.MAX_ATTEMPTS
    db.commit()

    with patch.object(
        growlio_client, "push_transaction", side_effect=growlio_client.GrowlioRequestError("down")
    ) as push:
        assert _flush(db, user.id) == 0

    assert push.call_count == 1  # 첫 실패에서 멈춘다
    assert growlio_push_service.pending_count(db, user.id) == 2  # MAX_ATTEMPTS에 닿은 행은 대기 목록에서 빠진다


def test_flush_never_raises(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db), token=None)
    with patch.object(growlio_client, "push_transaction", side_effect=RuntimeError("bug")):
        assert _flush(db, user.id) == 0


def test_external_ref_uses_queue_id(seeded_db):
    row = GrowlioPushQueue(
        id=42,
        growlio_account_id="g",
        transaction_type="DEPOSIT",
        amount=Decimal("1"),
        transaction_date=date(2026, 1, 1),
        owner_user_id=uuid.uuid4(),
    )
    assert growlio_push_service.external_ref(row) == "nestlio:q42"
