"""growlio_push_service — 저축·투자 거래의 growlio 입출금 반영 아웃박스."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.errors import NotFoundError
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
    """transaction_service와 같은 순서: 세션에 올리고 → (거래와 함께) 커밋 → 커밋 뒤 전송."""
    row = growlio_push_service.stage(db, product.id, "DEPOSIT", Decimal("300000"), date(2026, 10, 8), transaction_id=7)
    db.commit()
    if row is None:
        return None
    return growlio_push_service.send_staged(db, row, token)


def test_stage_ignores_products_without_growlio_link(seeded_db):
    db = seeded_db["db"]
    product = _product(db, growlio_account_id=None)
    with patch.object(growlio_client, "push_transaction") as push:
        assert _push(db, product) is None
    push.assert_not_called()
    assert db.query(GrowlioPushQueue).count() == 0


def test_stage_does_not_commit(seeded_db):
    """큐 행은 호출자의 거래와 같은 커밋으로 묶여야 하므로 stage 자체는 커밋하지 않는다."""
    db = seeded_db["db"]
    product = _product(db)
    growlio_push_service.stage(db, product.id, "DEPOSIT", Decimal("1"), date(2026, 10, 8))
    db.rollback()
    assert db.query(GrowlioPushQueue).count() == 0


def test_send_staged_uses_queue_row_external_ref_and_marks_sent(seeded_db):
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


def test_send_staged_keeps_failed_row_pending(seeded_db):
    db = seeded_db["db"]
    product = _product(db)
    with patch.object(growlio_client, "push_transaction", side_effect=growlio_client.GrowlioRequestError("down")):
        assert _push(db, product) is False

    row = db.query(GrowlioPushQueue).one()
    assert row.sent_at is None
    assert row.attempts == 0  # 접속 실패는 일시 오류 — 포기 횟수에 넣지 않는다
    assert row.last_error == "down"


def test_send_staged_without_token_leaves_row_queued(seeded_db):
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
    assert growlio_push_service.pending_query(db, user.id).count() == 2  # MAX_ATTEMPTS에 닿은 행은 대기 목록에서 빠진다


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


def _transient(status=None):
    return growlio_client.GrowlioRequestError("down", upstream_status=status)


def _permanent():
    return growlio_client.GrowlioRequestError("growlio API 오류 (status=404)", upstream_status=404)


@pytest.mark.parametrize(
    "exc",
    [
        _transient(),
        _transient(401),
        _transient(408),
        _transient(429),
        growlio_client.GrowlioNotConfiguredError("off"),
    ],
)
def test_transient_failures_never_abandon_row(seeded_db, exc):
    """growlio가 오래 잠들거나(접속 실패) 토큰이 만료돼도 행을 포기하지 않는다 — 전에는 10번이면 조용히 사라졌다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db), token=None)
    row = db.query(GrowlioPushQueue).one()
    with patch.object(growlio_client, "push_transaction", side_effect=exc):
        for _ in range(growlio_push_service.MAX_SERVER_ERRORS + 2):
            assert growlio_push_service.send(db, row, "token") is False

    assert (row.attempts, row.server_errors) == (0, 0)
    assert growlio_push_service.pending_query(db, user.id).count() == 1
    assert growlio_push_service.list_failed(db, user.id) == []


def test_permanent_failure_counts_and_abandons_after_max_attempts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db), token=None)
    row = db.query(GrowlioPushQueue).one()
    with patch.object(growlio_client, "push_transaction", side_effect=_permanent()):
        for _ in range(growlio_push_service.MAX_ATTEMPTS):
            growlio_push_service.send(db, row, "token")

    assert row.attempts == growlio_push_service.MAX_ATTEMPTS
    assert growlio_push_service.pending_query(db, user.id).count() == 0
    [failed] = growlio_push_service.list_failed(db, user.id)
    assert failed["id"] == row.id
    assert failed["product_name"] == "ETF"
    assert failed["last_error"] == "growlio API 오류 (status=404)"


def test_flush_skips_permanent_failure_and_sends_following_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db, "g-broken", owner_user_id=user.id), token=None)
    _push(db, _product(db, "g-ok", owner_user_id=user.id), token=None)

    def fake_push(token, account_id, *args, **kwargs):
        if account_id == "g-broken":
            raise _permanent()

    with patch.object(growlio_client, "push_transaction", side_effect=fake_push) as push:
        assert _flush(db, user.id) == 1

    assert push.call_count == 2
    rows = {r.growlio_account_id: r for r in db.query(GrowlioPushQueue).all()}
    assert rows["g-ok"].sent_at == NOW
    assert rows["g-broken"].attempts == 1


def test_send_does_not_raise_when_recording_commit_fails(seeded_db):
    """거래는 이미 커밋된 뒤라 결과 기록 커밋이 실패해도 요청을 500으로 만들지 않는다."""
    db = seeded_db["db"]
    _push(db, _product(db), token=None)
    row = db.query(GrowlioPushQueue).one()
    with (
        patch.object(growlio_client, "push_transaction"),
        patch.object(db, "commit", side_effect=RuntimeError("db gone")),
    ):
        assert growlio_push_service.send(db, row, "token") is True
    with (
        patch.object(growlio_client, "push_transaction", side_effect=_permanent()),
        patch.object(db, "commit", side_effect=RuntimeError("db gone")),
    ):
        assert growlio_push_service.send(db, row, "token") is False


def _abandoned(db, product):
    _push(db, product, token=None)
    row = db.query(GrowlioPushQueue).order_by(GrowlioPushQueue.id.desc()).first()
    row.attempts = growlio_push_service.MAX_ATTEMPTS
    row.last_error = "old"
    db.commit()
    return row


def test_retry_sends_abandoned_row(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    row = _abandoned(db, _product(db))
    with patch.object(growlio_client, "push_transaction") as push:
        assert growlio_push_service.retry(db, row.id, user.id, "token") is True
    push.assert_called_once()
    assert row.sent_at is not None
    assert growlio_push_service.list_failed(db, user.id) == []


def test_retry_permanent_failure_keeps_row_abandoned_with_new_reason(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    row = _abandoned(db, _product(db))
    with patch.object(growlio_client, "push_transaction", side_effect=_permanent()):
        assert growlio_push_service.retry(db, row.id, user.id, "token") is False
    [failed] = growlio_push_service.list_failed(db, user.id)
    assert failed["last_error"] == "growlio API 오류 (status=404)"


def test_retry_transient_failure_returns_row_to_auto_resend(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    row = _abandoned(db, _product(db))
    with patch.object(growlio_client, "push_transaction", side_effect=_transient(503)):
        assert growlio_push_service.retry(db, row.id, user.id, "token") is False
    assert growlio_push_service.list_failed(db, user.id) == []
    assert growlio_push_service.pending_query(db, user.id).count() == 1


def test_retry_rejects_spouse_owned_and_sent_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse3@example.com", display_name="Spouse 3")
    db.add(spouse)
    db.commit()
    theirs = _abandoned(db, _product(db, "g-theirs", owner_user_id=spouse.id))
    assert growlio_push_service.list_failed(db, user.id) == []
    with pytest.raises(NotFoundError):
        growlio_push_service.retry(db, theirs.id, user.id, "token")

    mine = _abandoned(db, _product(db, "g-mine"))
    mine.sent_at = NOW
    db.commit()
    with pytest.raises(NotFoundError):
        growlio_push_service.retry(db, mine.id, user.id, "token")


def _spouse(db, email="spouse4@example.com"):
    spouse = User(email=email, display_name="Spouse 4")
    db.add(spouse)
    db.commit()
    return spouse


def test_flush_skips_row_with_server_error_and_sends_following_rows(seeded_db):
    """행 하나만 계속 5xx를 받아도 뒤 행은 보낸다 — 전에는 일시 오류로 보고 멈춰 큐 전체가 영원히 막혔다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db, "g-500"), token=None)
    _push(db, _product(db, "g-ok"), token=None)

    def fake_push(token, account_id, *args, **kwargs):
        if account_id == "g-500":
            raise _transient(500)

    with patch.object(growlio_client, "push_transaction", side_effect=fake_push):
        assert _flush(db, user.id) == 1

    rows = {r.growlio_account_id: r for r in db.query(GrowlioPushQueue).all()}
    assert rows["g-ok"].sent_at == NOW
    assert (rows["g-500"].server_errors, rows["g-500"].attempts) == (1, 0)


def test_row_with_repeated_server_errors_is_abandoned_and_listed(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db), token=None)
    row = db.query(GrowlioPushQueue).one()
    with patch.object(growlio_client, "push_transaction", side_effect=_transient(500)):
        for _ in range(growlio_push_service.MAX_SERVER_ERRORS):
            growlio_push_service.send(db, row, "token")

    assert growlio_push_service.pending_query(db, user.id).count() == 0
    [failed] = growlio_push_service.list_failed(db, user.id)
    assert failed["id"] == row.id


def test_flush_still_stops_when_growlio_is_offline(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _push(db, _product(db, "g-1"), token=None)
    _push(db, _product(db, "g-2"), token=None)
    with patch.object(growlio_client, "push_transaction", side_effect=_transient()) as push:
        assert _flush(db, user.id) == 0
    assert push.call_count == 1


def test_shared_row_denied_by_one_spouse_is_left_for_the_other(seeded_db):
    """공동 상품이어도 growlio 계좌는 한 사람 것 — 계좌를 모르는 배우자 토큰의 404는 행을 소진하지 않는다."""
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _spouse(db)
    _push(db, _product(db, "g-shared"), token=None)
    row = db.query(GrowlioPushQueue).one()

    with patch.object(growlio_client, "push_transaction", side_effect=_permanent()):
        assert _flush(db, user.id) == 0
    assert (row.denied_user_id, row.attempts) == (user.id, 0)
    assert growlio_push_service.pending_query(db, user.id).count() == 0
    assert growlio_push_service.pending_query(db, spouse.id).count() == 1

    with patch.object(growlio_client, "push_transaction", side_effect=_permanent()):
        assert _flush(db, spouse.id) == 0
    assert row.attempts == 1  # 두 사람 모두 거부 — 이제 행의 문제


def test_send_staged_leaves_spouse_owned_row_for_its_owner(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _spouse(db)
    product = _product(db, "g-theirs", owner_user_id=spouse.id)
    row = growlio_push_service.stage(db, product.id, "DEPOSIT", Decimal("1"), date(2026, 10, 8))
    db.commit()

    with patch.object(growlio_client, "push_transaction") as push:
        assert growlio_push_service.send_staged(db, row, "token", caller_id=user.id) is True
    push.assert_not_called()
    assert (row.sent_at, row.attempts) == (None, 0)


def test_retry_keeps_row_abandoned_when_recording_fails(seeded_db):
    """카운터를 먼저 0으로 돌리지 않는다 — 결과 기록 커밋이 실패해도 포기 상태가 풀리지 않는다."""
    db, user = seeded_db["db"], seeded_db["user"]
    row = _abandoned(db, _product(db))
    with (
        patch.object(growlio_client, "push_transaction", side_effect=_permanent()),
        patch.object(db, "commit", side_effect=RuntimeError("db gone")),
    ):
        assert growlio_push_service.retry(db, row.id, user.id, "token") is False
    assert [f["id"] for f in growlio_push_service.list_failed(db, user.id)] == [row.id]
