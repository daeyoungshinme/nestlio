from decimal import Decimal
from unittest.mock import patch

from app.dependencies import get_bearer_token
from app.main import app as fastapi_app
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError


def _override_bearer_token():
    fastapi_app.dependency_overrides[get_bearer_token] = lambda: "fake-jwt"


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
    _override_bearer_token()

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


def test_get_growlio_unlinked_net_worth_not_configured_returns_501(client):
    _override_bearer_token()

    with patch(
        "app.services.net_worth_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
    ):
        resp = client.get("/api/v1/net-worth/growlio-unlinked")

    assert resp.status_code == 501


def test_get_growlio_unlinked_net_worth_request_failure_returns_502(client):
    _override_bearer_token()

    with patch(
        "app.services.net_worth_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
    ):
        resp = client.get("/api/v1/net-worth/growlio-unlinked")

    assert resp.status_code == 502
