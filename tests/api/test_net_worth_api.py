from decimal import Decimal
from unittest.mock import patch

from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError


def test_get_net_worth_aggregates_current_state(client):
    client.post("/api/v1/accounts", json={"name": "주거래통장", "account_type": "bank", "initial_balance": "1000000"})
    client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "2000000", "monthly_saving_amount": "300000"},
    )
    client.post(
        "/api/v1/loans",
        json={
            "name": "신용대출",
            "balance": "500000",
            "monthly_payment": "50000",
            "origination_year_month": None,
            "term_months": None,
            "interest_rate": None,
            "repayment_method": None,
        },
    )

    resp = client.get("/api/v1/net-worth")

    assert resp.status_code == 200
    body = resp.json()
    assert Decimal(body["current"]["net_worth"]) == Decimal("2500000")
    assert body["history"] == []


def test_get_growlio_unlinked_net_worth_returns_summary(client):

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-bank-1", "name": "미연동 은행", "asset_type": "BANK_ACCOUNT", "current_value_krw": 200000.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[],
        ),
    ):
        resp = client.get("/api/v1/net-worth/growlio-unlinked")

    assert resp.status_code == 200
    body = resp.json()
    assert Decimal(body["bank_total"]) == Decimal("200000")
    assert body["item_count"] == 1


def test_get_growlio_unlinked_net_worth_not_configured_returns_zero(client):
    # 두 growlio 호출이 동시에 나가므로(net_worth_service.compute_growlio_unlinked) 둘 다
    # mock해야 한다 — 하나만 mock하면 나머지가 실제 httpx 호출을 시도해 테스트가 느려진다.
    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
        ),
    ):
        resp = client.get("/api/v1/net-worth/growlio-unlinked")

    assert resp.status_code == 200
    body = resp.json()
    assert body["item_count"] == 0
    assert Decimal(body["net_total"]) == Decimal("0")


def test_get_growlio_unlinked_net_worth_request_failure_returns_zero(client):
    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
        ),
    ):
        resp = client.get("/api/v1/net-worth/growlio-unlinked")

    assert resp.status_code == 200
    body = resp.json()
    assert body["item_count"] == 0
    assert Decimal(body["net_total"]) == Decimal("0")


def _abandoned_push(db, owner_user_id=None):
    from datetime import date

    from app.models.growlio_push_queue import GrowlioPushQueue
    from app.models.savings_product import SavingsProduct
    from app.services import growlio_push_service

    db.add(
        SavingsProduct(
            name="ETF",
            current_balance=Decimal("0"),
            monthly_saving_amount=Decimal("0"),
            growlio_account_id="g-1",
            owner_user_id=owner_user_id,
        )
    )
    row = GrowlioPushQueue(
        growlio_account_id="g-1",
        owner_user_id=owner_user_id,
        transaction_type="DEPOSIT",
        amount=Decimal("300000"),
        transaction_date=date(2026, 10, 8),
        attempts=growlio_push_service.MAX_ATTEMPTS,
        last_error="growlio API 오류 (status=404)",
    )
    db.add(row)
    db.commit()
    return row


def test_failed_growlio_pushes_lists_abandoned_rows(client, seeded_db):
    row = _abandoned_push(seeded_db["db"])

    resp = client.get("/api/v1/net-worth/growlio-pushes/failed")

    assert resp.status_code == 200
    assert resp.json() == [
        {
            "id": row.id,
            "product_name": "ETF",
            "transaction_type": "DEPOSIT",
            "amount": "300000.00",
            "transaction_date": "2026-10-08",
            "last_error": "growlio API 오류 (status=404)",
        }
    ]


def test_retry_growlio_push_sends_with_caller_token(client, seeded_db):
    row = _abandoned_push(seeded_db["db"])

    with patch("app.services.growlio_push_service.growlio_client.push_transaction") as push:
        resp = client.post(f"/api/v1/net-worth/growlio-pushes/{row.id}/retry")

    assert resp.status_code == 200
    assert resp.json() == {"sent": True}
    assert push.call_args.args[0] == "test-bearer-token"
    assert client.get("/api/v1/net-worth/growlio-pushes/failed").json() == []


def test_retry_growlio_push_unknown_id_is_404(client):
    assert client.post("/api/v1/net-worth/growlio-pushes/9999/retry").status_code == 404
