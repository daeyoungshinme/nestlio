"""app/services/growlio_client.py — account/savings_product/real_estate 서비스가 공유하는
growlio 연동 순수 헬퍼. 지금까지 API 테스트에서 growlio를 통째로 mock 해서 간접적으로만
지나갔지만, to_decimal_krw/find_by_growlio_id/already_linked_growlio_ids/sync_linked_rows는
순수 함수라 직접 못박는다.
"""
from datetime import datetime
from decimal import Decimal

import pytest

from app.models.account import Account
from app.services import growlio_client


@pytest.mark.parametrize(
    "raw,expected",
    [
        (1234567, Decimal("1234567")),
        ("1234567.89", Decimal("1234567.89")),
        (0, Decimal("0")),
        (1000.5, Decimal("1000.5")),
    ],
)
def test_to_decimal_krw_accepts_int_float_str(raw, expected):
    assert growlio_client.to_decimal_krw(raw) == expected


def test_find_by_growlio_id_matches_and_misses():
    items = [{"id": "a", "v": 1}, {"id": "b", "v": 2}]
    assert growlio_client.find_by_growlio_id(items, "b") == {"id": "b", "v": 2}
    assert growlio_client.find_by_growlio_id(items, "z") is None
    assert growlio_client.find_by_growlio_id([], "a") is None


def _account(db, name, *, growlio_id=None, active=True):
    acc = Account(name=name, account_type="bank", growlio_account_id=growlio_id, is_active=active)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


def test_already_linked_growlio_ids_collects_active_linked_only(db_session):
    _account(db_session, "linked-1", growlio_id="g1")
    _account(db_session, "linked-2", growlio_id="g2")
    _account(db_session, "unlinked", growlio_id=None)
    _account(db_session, "linked-inactive", growlio_id="g3", active=False)

    assert growlio_client.already_linked_growlio_ids(db_session, Account) == {"g1", "g2"}
    assert growlio_client.already_linked_growlio_ids(db_session, Account, active_only=False) == {"g1", "g2", "g3"}


def test_sync_linked_rows_applies_matches_and_collects_failures(db_session):
    matched = _account(db_session, "matched", growlio_id="g1")
    unmatched = _account(db_session, "gone-from-growlio", growlio_id="g2")
    now = datetime(2026, 8, 11, 9, 0)
    applied: list[tuple[str, dict]] = []

    synced_count, failed = growlio_client.sync_linked_rows(
        [matched, unmatched],
        [{"id": "g1", "value_krw": 500}],
        now=now,
        apply=lambda row, match: applied.append((row.name, match)),
    )

    assert synced_count == 1
    assert applied == [("matched", {"id": "g1", "value_krw": 500})]
    assert matched.last_synced_at == now
    assert unmatched.last_synced_at is None
    assert failed == [
        {"id": unmatched.id, "name": "gone-from-growlio", "reason": growlio_client.SYNC_MATCH_FAILED_REASON}
    ]
