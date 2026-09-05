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


def test_annual_plan_returns_year_and_groups(client, seeded_db):
    client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "100000", "product_type": "savings"},
    )

    resp = client.get("/api/v1/savings-products/annual-plan", params={"year": 2026})

    assert resp.status_code == 200
    body = resp.json()
    assert body["year"] == 2026
    assert len(body["items"]) == 1
    assert body["items"][0]["annual_target"] == "1200000.00"
    assert "target_to_date" in body["savings"]


def test_get_product_annual_plan_defaults_from_monthly_saving_amount(client, seeded_db):
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "100000", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/savings-products/{product_id}/annual-plan/2026")

    assert resp.status_code == 200
    body = resp.json()
    assert body["product_id"] == product_id
    assert body["start_month"] == "2026-01"
    assert body["end_month"] == "2026-12"
    assert len(body["monthly_targets"]) == 12
    assert all(t["target_amount"] == "100000.00" for t in body["monthly_targets"])


def test_get_product_annual_plan_missing_product_returns_404(client, seeded_db):
    resp = client.get("/api/v1/savings-products/9999/annual-plan/2026")

    assert resp.status_code == 404


def test_upsert_product_annual_plan_persists_and_is_read_back(client, seeded_db):
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    upsert_resp = client.put(
        f"/api/v1/savings-products/{product_id}/annual-plan",
        json={
            "year": 2026,
            "start_month": "2026-06",
            "end_month": "2026-08",
            "monthly_targets": [
                {"year_month": "2026-06", "target_amount": "100000"},
                {"year_month": "2026-07", "target_amount": "150000"},
                {"year_month": "2026-08", "target_amount": "200000"},
            ],
        },
    )

    assert upsert_resp.status_code == 200
    body = upsert_resp.json()
    assert body["start_month"] == "2026-06"
    assert [t["target_amount"] for t in body["monthly_targets"]] == ["100000.00", "150000.00", "200000.00"]

    get_resp = client.get(f"/api/v1/savings-products/{product_id}/annual-plan/2026")
    assert get_resp.json() == body


def test_upsert_product_annual_plan_accepts_blank_target_amount_as_zero(client, seeded_db):
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    upsert_resp = client.put(
        f"/api/v1/savings-products/{product_id}/annual-plan",
        json={
            "year": 2026,
            "start_month": "2026-06",
            "end_month": "2026-06",
            "monthly_targets": [{"year_month": "2026-06", "target_amount": ""}],
        },
    )

    assert upsert_resp.status_code == 200
    body = upsert_resp.json()
    assert body["monthly_targets"] == [{"year_month": "2026-06", "target_amount": "0.00"}]


def test_upsert_product_annual_plan_missing_product_returns_404(client, seeded_db):
    resp = client.put(
        "/api/v1/savings-products/9999/annual-plan",
        json={"year": 2026, "start_month": "2026-01", "end_month": "2026-12", "monthly_targets": []},
    )

    assert resp.status_code == 404


def test_growlio_import_creates_one_product_per_selected_account(client, seeded_db):
    _override_bearer_token()

    with patch(
        "app.services.savings_product_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 1234500.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        resp = client.post(
            "/api/v1/savings-products/growlio-import",
            json={"growlio_account_ids": ["growlio-acc-1", "growlio-acc-2"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    by_account = {p["growlio_account_id"]: p for p in body}
    assert by_account["growlio-acc-1"]["product_type"] == "savings"
    assert by_account["growlio-acc-1"]["current_balance"] == "1234500.00"
    assert by_account["growlio-acc-2"]["product_type"] == "investment"
    assert by_account["growlio-acc-2"]["current_balance"] == "5000000.00"
    assert by_account["growlio-acc-2"]["auto_sync_enabled"] is True
    # 가져오기를 실행한 로그인 사용자가 그 상품의 소유자로 자동 설정된다
    for product in body:
        assert product["owner_user_id"] == str(seeded_db["user"].id)


def test_deactivate_product_404_when_missing(client):
    assert client.post("/api/v1/savings-products/99999/deactivate").status_code == 404
