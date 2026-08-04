from decimal import Decimal
from unittest.mock import patch

from app.dependencies import get_bearer_token
from app.main import app as fastapi_app


def _override_bearer_token():
    fastapi_app.dependency_overrides[get_bearer_token] = lambda: "fake-jwt"


def test_growlio_link_and_unlink(client, seeded_db):
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    link_resp = client.put(
        f"/api/v1/savings-products/{product_id}/growlio-link",
        json={"growlio_account_id": "growlio-acc-1", "auto_sync_enabled": True},
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["growlio_account_id"] == "growlio-acc-1"
    assert link_resp.json()["auto_sync_enabled"] is True

    unlink_resp = client.put(
        f"/api/v1/savings-products/{product_id}/growlio-link",
        json={"growlio_account_id": None, "auto_sync_enabled": True},
    )
    assert unlink_resp.status_code == 200
    assert unlink_resp.json()["growlio_account_id"] is None
    assert unlink_resp.json()["auto_sync_enabled"] is False


def test_create_investment_product_with_principal_returns_return_rate(client, seeded_db):
    resp = client.post(
        "/api/v1/savings-products",
        json={
            "name": "펀드",
            "current_balance": "1200000",
            "monthly_saving_amount": "0",
            "product_type": "investment",
            "principal_amount": "1000000",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["principal_amount"] == "1000000.00"
    assert body["return_amount"] == "200000.00"
    assert Decimal(body["return_rate_pct"]) == Decimal("20")


def test_growlio_link_missing_product_returns_404(client, seeded_db):
    resp = client.put(
        "/api/v1/savings-products/9999/growlio-link",
        json={"growlio_account_id": "growlio-acc-1", "auto_sync_enabled": True},
    )
    assert resp.status_code == 404


def test_sync_without_link_returns_409(client, seeded_db):
    _override_bearer_token()
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/savings-products/{product_id}/sync")

    assert resp.status_code == 409


def test_sync_updates_balance(client, seeded_db):
    _override_bearer_token()
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]
    client.put(
        f"/api/v1/savings-products/{product_id}/growlio-link",
        json={"growlio_account_id": "growlio-acc-1", "auto_sync_enabled": True},
    )

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 555000.0}],
    ):
        resp = client.post(f"/api/v1/savings-products/{product_id}/sync")

    assert resp.status_code == 200
    assert resp.json()["current_balance"] == "555000.00"
    assert resp.json()["last_synced_at"] is not None


def test_list_growlio_accounts_proxies_client(client, seeded_db):
    _override_bearer_token()

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1.0}],
    ):
        resp = client.get("/api/v1/savings-products/growlio-accounts")

    assert resp.status_code == 200
    assert resp.json() == [{"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1.0, "as_of": None}]
