"""거래 API의 입력 상한·일괄 삭제 원자성 — 컬럼 범위를 넘는 입력이 Postgres DataError(500) 대신 422로,
일괄 삭제가 중간 실패 시 일부만 지워진 채 남지 않는지."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.transaction import Transaction
from app.schemas.transaction import BULK_DELETE_MAX
from app.services import transaction_service


def test_bulk_delete_is_all_or_nothing_when_commit_fails(client, seeded_db):
    # 행마다 커밋하던 시절엔 중간 실패 시 앞쪽 일부만 지워진 채 남았다 — 한 번의 커밋으로 묶였는지 확인.
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx1 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000"), date(2026, 7, 1))
    tx2 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("2000"), date(2026, 7, 2))
    ids = [tx1.id, tx2.id]

    with patch.object(db, "commit", side_effect=RuntimeError("db down")), pytest.raises(RuntimeError):
        transaction_service.bulk_delete_transactions(db, ids)

    assert db.query(Transaction).filter(Transaction.id.in_(ids)).count() == 2


def test_bulk_delete_rejects_more_than_max_ids(client):
    resp = client.post("/api/v1/transactions/bulk-delete", json={"ids": list(range(1, BULK_DELETE_MAX + 2))})
    assert resp.status_code == 422


def test_overlong_description_is_422_not_500(client, seeded_db):
    resp = client.post(
        "/api/v1/transactions",
        json={
            "amount": "1000",
            "type": "expense",
            "category_id": seeded_db["food"].id,
            "transaction_date": "2026-07-05",
            "description": "가" * 256,
        },
    )
    assert resp.status_code == 422
