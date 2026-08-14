from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.dependencies import get_bearer_token
from app.main import app as fastapi_app
from app.services import transaction_service


def _override_bearer_token():
    fastapi_app.dependency_overrides[get_bearer_token] = lambda: "fake-jwt"


def test_create_and_get_transaction(client, seeded_db):
    _override_bearer_token()
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


def test_create_transaction_sets_warning_header_when_growlio_push_fails(client, seeded_db):
    from app.models.category import Category
    from app.models.savings_product import SavingsProduct
    from app.services import growlio_client

    _override_bearer_token()
    db = seeded_db["db"]
    savings_category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    product = SavingsProduct(
        name="적금", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"),
        growlio_account_id="growlio-acct-1",
    )
    db.add_all([savings_category, product])
    db.commit()
    db.refresh(savings_category)
    db.refresh(product)

    with patch.object(growlio_client, "push_transaction", side_effect=growlio_client.GrowlioRequestError("boom")):
        resp = client.post(
            "/api/v1/transactions",
            json={
                "amount": "50000",
                "type": "expense",
                "category_id": savings_category.id,
                "transaction_date": "2026-07-05",
                "savings_product_id": product.id,
            },
        )

    assert resp.status_code == 201
    assert resp.headers.get("x-growlio-sync-warning") == "1"


def test_create_transaction_without_growlio_link_has_no_warning_header(client, seeded_db):
    _override_bearer_token()
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/transactions",
        json={
            "amount": "12000",
            "type": "expense",
            "category_id": food.id,
            "transaction_date": "2026-07-05",
        },
    )
    assert resp.status_code == 201
    assert "x-growlio-sync-warning" not in resp.headers


def test_update_transaction(client, seeded_db):
    _override_bearer_token()
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
    _override_bearer_token()
    resp = client.put(
        "/api/v1/transactions/999999",
        json={"amount": "1000", "type": "expense", "category_id": 1, "transaction_date": "2026-07-01"},
    )
    assert resp.status_code == 404


def test_delete_transaction(client, seeded_db):
    _override_bearer_token()
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


def test_bulk_delete_transactions(client, seeded_db):
    _override_bearer_token()
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx1 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000"), date(2026, 7, 1))
    tx2 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("2000"), date(2026, 7, 2))

    resp = client.post("/api/v1/transactions/bulk-delete", json={"ids": [tx1.id, tx2.id, 999999]})

    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == 2
    assert body["failed"] == [999999]
    assert client.get(f"/api/v1/transactions/{tx1.id}").status_code == 404
    assert client.get(f"/api/v1/transactions/{tx2.id}").status_code == 404


def test_list_transactions_filters_by_search_query(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 5), description="스타벅스 커피"
    )
    transaction_service.create_transaction(
        db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 7, 1), description="월세"
    )

    resp = client.get(
        "/api/v1/transactions",
        params={"date_from": "2026-07-01", "date_to": "2026-07-31", "q": "커피"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["description"] == "스타벅스 커피"


def test_list_transactions_search_query_matches_category_name(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 5))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 7, 1))

    resp = client.get(
        "/api/v1/transactions",
        params={"date_from": "2026-07-01", "date_to": "2026-07-31", "q": "식비"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["category"]["name"] == "식비"


def test_import_csv(client):
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,식비,10000,점심\n"
    resp = client.post(
        "/api/v1/transactions/import",
        files={"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1
    assert resp.json()["skipped"] == []


def test_import_sheet_public_mode(client):
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,식비,10000,점심\n"
    with patch("app.services.google_sheets_service.read_public_csv", return_value=csv_text):
        resp = client.post(
            "/api/v1/transactions/import-sheet",
            json={"mode": "public", "sheet_url": "https://docs.google.com/spreadsheets/d/abc123/edit"},
        )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1


def test_import_sheet_public_mode_requires_sheet_url(client):
    resp = client.post("/api/v1/transactions/import-sheet", json={"mode": "public"})
    assert resp.status_code == 400


def test_import_sheet_oauth_mode_requires_google_connection(client):
    with patch("app.services.google_auth.is_connected", return_value=False):
        resp = client.post(
            "/api/v1/transactions/import-sheet",
            json={"mode": "oauth", "spreadsheet_id": "abc123"},
        )
    assert resp.status_code == 400


def test_import_sheet_oauth_mode_requires_spreadsheet_id(client):
    resp = client.post("/api/v1/transactions/import-sheet", json={"mode": "oauth"})
    assert resp.status_code == 400


def test_import_sheet_oauth_mode_success(client):
    rows = [
        ["날짜", "구분", "카테고리", "금액", "메모"],
        ["2026-07-05", "지출", "식비", "10000", "점심"],
    ]
    with (
        patch("app.services.google_auth.is_connected", return_value=True),
        patch("app.services.google_sheets_service.read_values", return_value=rows),
    ):
        resp = client.post(
            "/api/v1/transactions/import-sheet",
            json={"mode": "oauth", "spreadsheet_id": "abc123"},
        )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1


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
