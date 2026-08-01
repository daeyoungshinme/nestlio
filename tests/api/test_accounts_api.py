from decimal import Decimal


def test_create_and_list_accounts(client):
    resp = client.post(
        "/api/v1/accounts", json={"name": "주거래통장", "account_type": "bank", "initial_balance": "500000"}
    )
    assert resp.status_code == 201

    list_resp = client.get("/api/v1/accounts")
    assert list_resp.status_code == 200
    row = next(r for r in list_resp.json() if r["account"]["name"] == "주거래통장")
    assert Decimal(row["balance"]) == Decimal("500000")


def test_deactivate_account_excludes_it_from_list(client):
    create_resp = client.post(
        "/api/v1/accounts", json={"name": "비상금계좌", "account_type": "bank", "initial_balance": "0"}
    )
    account_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/accounts/{account_id}/deactivate")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/accounts")
    assert all(r["account"]["id"] != account_id for r in list_resp.json())
