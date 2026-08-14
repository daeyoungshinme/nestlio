from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.dependencies import get_bearer_token
from app.main import app as fastapi_app
from app.services import transaction_service


def _override_bearer_token():
    fastapi_app.dependency_overrides[get_bearer_token] = lambda: "fake-jwt"


def test_create_and_list_accounts(client, seeded_db):
    user = seeded_db["user"]
    resp = client.post(
        "/api/v1/accounts",
        json={"name": "주거래통장", "account_type": "bank", "initial_balance": "500000", "owner_user_id": str(user.id)},
    )
    assert resp.status_code == 201
    assert resp.json()["owner_user_id"] == str(user.id)

    list_resp = client.get("/api/v1/accounts")
    assert list_resp.status_code == 200
    row = next(r for r in list_resp.json() if r["account"]["name"] == "주거래통장")
    assert Decimal(row["balance"]) == Decimal("500000")
    assert row["account"]["owner_user_id"] == str(user.id)


def test_update_account_changes_fields(client):
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "구이름", "account_type": "bank", "initial_balance": "100000"}
    )
    account_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/v1/accounts/{account_id}",
        json={"name": "새이름", "account_type": "cash", "current_balance": "200000"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "새이름"
    assert body["account_type"] == "cash"
    assert Decimal(body["initial_balance"]) == Decimal("200000")


def test_update_account_with_existing_transactions_sets_displayed_balance_exactly(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "월급통장", "account_type": "bank", "initial_balance": "100000"}
    )
    account_id = create_resp.json()["id"]
    transaction_service.create_transaction(
        db, user.id, food.id, "income", Decimal("50000"), date(2026, 7, 1), account_id=account_id
    )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("20000"), date(2026, 7, 2), account_id=account_id
    )
    # this account's initial_balance(100000) + net transactions(50000-20000) = 130000,
    # so a naive overwrite of initial_balance would make the displayed balance drift from
    # whatever is entered here - the PUT payload should still land exactly on 999000.
    resp = client.put(
        f"/api/v1/accounts/{account_id}",
        json={"name": "월급통장", "account_type": "bank", "current_balance": "999000"},
    )
    assert resp.status_code == 200

    list_resp = client.get("/api/v1/accounts")
    row = next(r for r in list_resp.json() if r["account"]["id"] == account_id)
    assert Decimal(row["balance"]) == Decimal("999000")


def test_update_account_404_when_missing(client):
    resp = client.put(
        "/api/v1/accounts/99999",
        json={"name": "x", "account_type": "bank", "current_balance": "0"},
    )
    assert resp.status_code == 404


def test_deactivate_account_excludes_it_from_list(client):
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "비상금계좌", "account_type": "bank", "initial_balance": "0"}
    )
    account_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/accounts/{account_id}/deactivate")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/accounts")
    assert all(r["account"]["id"] != account_id for r in list_resp.json())


def test_list_growlio_accounts_proxies_bank_accounts_only(client):
    _override_bearer_token()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        resp = client.get("/api/v1/accounts/growlio-accounts")

    assert resp.status_code == 200
    assert [a["id"] for a in resp.json()] == ["growlio-acc-1"]


def test_sync_account_without_link_returns_409(client):
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "월급통장", "account_type": "bank", "initial_balance": "0"}
    )
    account_id = create_resp.json()["id"]
    _override_bearer_token()

    resp = client.post(f"/api/v1/accounts/{account_id}/sync")

    assert resp.status_code == 409


def test_sync_account_updates_displayed_balance_and_last_synced_at(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "월급통장", "account_type": "bank", "initial_balance": "100000"}
    )
    account_id = create_resp.json()["id"]
    _override_bearer_token()
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
        ],
    ):
        import_resp = client.post(
            "/api/v1/accounts/growlio-import",
            json={"growlio_account_ids": ["growlio-acc-1"]},
        )
    assert import_resp.status_code == 200
    imported_id = next(
        r["account"]["id"]
        for r in client.get("/api/v1/accounts").json()
        if r["account"]["growlio_account_id"] == "growlio-acc-1"
    )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("20000"), date(2026, 7, 2), account_id=imported_id
    )
    # displayed balance before sync: 1500000 - 20000 = 1480000

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 999000.0},
        ],
    ):
        resp = client.post(f"/api/v1/accounts/{imported_id}/sync")

    assert resp.status_code == 200
    assert resp.json()["last_synced_at"] is not None

    list_resp = client.get("/api/v1/accounts")
    row = next(r for r in list_resp.json() if r["account"]["id"] == imported_id)
    assert Decimal(row["balance"]) == Decimal("999000")


def test_sync_all_accounts_returns_synced_count_and_failed_list(client):
    _override_bearer_token()
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
        ],
    ):
        client.post("/api/v1/accounts/growlio-import", json={"growlio_account_ids": ["growlio-acc-1"]})

        resp = client.post("/api/v1/accounts/sync-all")

    assert resp.status_code == 200
    body = resp.json()
    assert body["synced_count"] == 1
    assert body["failed"] == []


def test_growlio_import_creates_one_account_per_selected_bank_account(client, seeded_db):
    _override_bearer_token()

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
        ],
    ):
        resp = client.post(
            "/api/v1/accounts/growlio-import",
            json={"growlio_account_ids": ["growlio-acc-1"]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["growlio_account_id"] == "growlio-acc-1"
    assert body[0]["account_type"] == "bank"
    assert body[0]["initial_balance"] == "1500000.00"
    # 가져오기를 실행한 로그인 사용자가 그 계좌의 소유자로 자동 설정된다
    assert body[0]["owner_user_id"] == str(seeded_db["user"].id)
