from datetime import date
from decimal import Decimal

from app.services import transaction_service


def test_create_and_get_transaction(client, seeded_db):
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/transactions",
        json={
            "amount": "12000",
            "type": "expense",
            "category_id": food.id,
            "transaction_date": "2026-07-05",
            "description": "점심",
        },
    )
    assert resp.status_code == 201
    tx_id = resp.json()["id"]
    assert resp.json()["category"]["name"] == "식비"

    get_resp = client.get(f"/api/v1/transactions/{tx_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["description"] == "점심"


def test_get_unknown_transaction_returns_404(client):
    resp = client.get("/api/v1/transactions/999999")
    assert resp.status_code == 404


def test_update_transaction(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    tx = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1))

    resp = client.put(
        f"/api/v1/transactions/{tx.id}",
        json={
            "amount": "20000",
            "type": "expense",
            "category_id": rent.id,
            "transaction_date": "2026-07-02",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["category"]["name"] == "주거비"
    assert Decimal(resp.json()["amount"]) == Decimal("20000")


def test_update_unknown_transaction_returns_404(client):
    resp = client.put(
        "/api/v1/transactions/999999",
        json={"amount": "1000", "type": "expense", "category_id": 1, "transaction_date": "2026-07-01"},
    )
    assert resp.status_code == 404


def test_delete_transaction(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("5000"), date(2026, 7, 1))

    resp = client.delete(f"/api/v1/transactions/{tx.id}")
    assert resp.status_code == 204
    assert client.get(f"/api/v1/transactions/{tx.id}").status_code == 404


def test_list_transactions_filters_by_date_range(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000"), date(2026, 7, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("2000"), date(2026, 8, 1))

    resp = client.get("/api/v1/transactions", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert Decimal(body["totals"]["expense"]) == Decimal("1000")


def test_import_csv(client):
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,식비,10000,점심\n"
    resp = client.post(
        "/api/v1/transactions/import",
        files={"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1
    assert resp.json()["skipped"] == []


def test_category_breakdown(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 5))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("5000"), date(2026, 7, 6))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("30000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("9999"), date(2026, 8, 1))

    resp = client.get(
        "/api/v1/transactions/category-breakdown",
        params={"date_from": "2026-07-01", "date_to": "2026-07-31"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["category_id"] == rent.id
    assert Decimal(body[0]["amount"]) == Decimal("30000")
    assert body[1]["category_id"] == food.id
    assert Decimal(body[1]["amount"]) == Decimal("15000")


def test_category_breakdown_defaults_to_expense_type(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000"), date(2026, 7, 5))

    resp = client.get(
        "/api/v1/transactions/category-breakdown",
        params={"date_from": "2026-07-01", "date_to": "2026-07-31", "type": "income"},
    )

    assert resp.status_code == 200
    assert resp.json() == []


def test_export_csv(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("3000"), date(2026, 7, 5), description="커피")

    resp = client.get("/api/v1/transactions/export.csv", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "커피" in resp.content.decode("utf-8-sig")
