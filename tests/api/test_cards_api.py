from decimal import Decimal


def _bank(client, name="월급통장", balance="100000"):
    return client.post("/api/v1/accounts", json={"name": name, "account_type": "bank", "initial_balance": balance}).json()


def test_create_list_update_and_deactivate_card(client, seeded_db):
    bank = _bank(client)
    user = seeded_db["user"]

    resp = client.post(
        "/api/v1/cards",
        json={"name": "신한카드", "card_type": "credit", "payment_account_id": bank["id"], "owner_user_id": str(user.id)},
    )
    assert resp.status_code == 201
    card = resp.json()
    assert card["payment_account"]["name"] == "월급통장"

    [row] = client.get("/api/v1/cards").json()
    assert (row["card"]["id"], row["unlinked_transaction_count"]) == (card["id"], 0)

    resp = client.put(f"/api/v1/cards/{card['id']}", json={"name": "신한체크", "card_type": "debit", "payment_account_id": None})
    assert resp.status_code == 200
    assert (resp.json()["name"], resp.json()["card_type"], resp.json()["payment_account"]) == ("신한체크", "debit", None)

    assert client.post(f"/api/v1/cards/{card['id']}/deactivate").status_code == 204
    assert client.get("/api/v1/cards").json() == []


def test_missing_card_returns_404(client):
    assert client.put("/api/v1/cards/999", json={"name": "x", "card_type": "credit"}).status_code == 404
    assert client.post("/api/v1/cards/999/deactivate").status_code == 404


def test_invalid_payment_account_returns_400(client):
    resp = client.post("/api/v1/cards", json={"name": "카드", "card_type": "credit", "payment_account_id": 999})
    assert resp.status_code == 400


def test_card_type_is_validated(client):
    assert client.post("/api/v1/cards", json={"name": "카드", "card_type": "prepaid"}).status_code == 422
    assert client.post("/api/v1/cards", json={"name": "가" * 101, "card_type": "credit"}).status_code == 422


def test_transaction_with_card_is_linked_to_payment_account(client, seeded_db):
    bank = _bank(client)
    card = client.post("/api/v1/cards", json={"name": "신한카드", "card_type": "debit", "payment_account_id": bank["id"]}).json()

    resp = client.post(
        "/api/v1/transactions",
        json={
            "amount": "12000", "type": "expense", "category_id": seeded_db["food"].id,
            "transaction_date": "2026-07-05", "card_id": card["id"],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert (body["card"]["name"], body["account"]["id"], body["payment_method"]) == ("신한카드", bank["id"], "debit_card")

    [row] = client.get("/api/v1/accounts").json()
    assert Decimal(row["balance"]) == Decimal("88000")


def test_transaction_with_unknown_card_returns_400(client, seeded_db):
    resp = client.post(
        "/api/v1/transactions",
        json={
            "amount": "1000", "type": "expense", "category_id": seeded_db["food"].id,
            "transaction_date": "2026-07-05", "card_id": 999,
        },
    )
    assert resp.status_code == 400


def test_card_account_type_is_no_longer_accepted(client):
    resp = client.post("/api/v1/accounts", json={"name": "카드", "account_type": "card", "initial_balance": "0"})
    assert resp.status_code == 422
