from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.models.transaction import Transaction
from app.services import transaction_service
from app.services.google_auth import GoogleAuthError


def _http_error(status: int) -> HttpError:
    resp = MagicMock()
    resp.status = status
    resp.reason = "boom"
    return HttpError(resp, b"{}")


def test_create_transaction(client, seeded_db):
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
    assert resp.json()["category"]["name"] == "식비"
    assert resp.json()["description"] == "점심"


def test_create_transaction_sets_warning_header_when_growlio_push_fails(client, seeded_db):
    from app.models.category import Category
    from app.models.savings_product import SavingsProduct
    from app.services import growlio_client

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


def test_update_transaction_checks_budget_threshold_for_edited_category_and_month(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    tx = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1))

    with patch("app.services.notification_service.check_and_alert_budget_threshold") as alert:
        resp = client.put(
            f"/api/v1/transactions/{tx.id}",
            json={"amount": "900000", "type": "expense", "category_id": rent.id, "transaction_date": "2026-06-30"},
        )

    assert resp.status_code == 200
    alert.assert_called_once_with(db, rent.id, "2026-06")


def test_update_transaction_to_income_skips_budget_threshold(client, seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]
    tx = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1))

    with patch("app.services.notification_service.check_and_alert_budget_threshold") as alert:
        resp = client.put(
            f"/api/v1/transactions/{tx.id}",
            json={"amount": "10000", "type": "income", "category_id": salary.id, "transaction_date": "2026-07-01"},
        )

    assert resp.status_code == 200
    alert.assert_not_called()


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
    assert db.get(Transaction, tx.id) is None


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
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx1 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000"), date(2026, 7, 1))
    tx2 = transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("2000"), date(2026, 7, 2))

    resp = client.post("/api/v1/transactions/bulk-delete", json={"ids": [tx1.id, tx2.id, 999999]})

    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == 2
    assert body["failed"] == [999999]
    assert db.get(Transaction, tx1.id) is None
    assert db.get(Transaction, tx2.id) is None


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


def test_import_csv_undecodable_file_returns_400(client):
    # UTF-8도 CP949도 아닌 바이트(0xFF 0xFF는 CP949 선행바이트로도 무효) → 500이 아니라 안내 400
    resp = client.post(
        "/api/v1/transactions/import",
        files={"file": ("import.csv", b"\xff\xff\xff", "text/csv")},
    )
    assert resp.status_code == 400
    assert "인코딩" in resp.json()["detail"]


def test_import_csv_over_size_limit_returns_413(client, monkeypatch):
    monkeypatch.setattr("app.routers.transactions.settings.max_upload_size_mb", 1)
    oversized = b"a" * (1024 * 1024 + 1)

    resp = client.post("/api/v1/transactions/import", files={"file": ("big.csv", oversized, "text/csv")})

    assert resp.status_code == 413


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


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (GoogleAuthError("구글 계정 연결이 만료됐어요."), 409),
        (_http_error(500), 502),
        (_http_error(429), 502),
        (RefreshError("invalid_grant"), 502),
    ],
)
def test_import_sheet_oauth_mode_maps_google_failures(client, error, expected_status):
    # 403/404만 GoogleSheetsReadError(400)로 바뀌고, 토큰 만료·429·5xx는 500이 아니라 409/502로 내려야 한다.
    with (
        patch("app.services.google_auth.is_connected", return_value=True),
        patch("app.services.google_sheets_service.read_values", side_effect=error),
    ):
        resp = client.post(
            "/api/v1/transactions/import-sheet",
            json={"mode": "oauth", "spreadsheet_id": "abc123"},
        )
    assert resp.status_code == expected_status


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


def test_unknown_api_path_is_404_not_spa_fallback(client):
    # 삭제된 GET /transactions/{id} 같은 없는 API 경로가 (dist가 있을 때) SPA index.html 200으로 새지 않는다.
    assert client.get("/api/v1/transactions/123").status_code in (404, 405)


def test_list_transactions_totals_follow_search_query(client, seeded_db):
    """합계는 목록과 같은 집합이어야 한다 — 검색 중에도 기간 전체 합계가 나오던 회귀."""
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

    assert Decimal(resp.json()["totals"]["expense"]) == Decimal("10000")


def test_list_transactions_search_without_dates_includes_future_rows_in_totals(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("7000"), date(2099, 1, 1), description="미래 커피"
    )

    body = client.get("/api/v1/transactions", params={"q": "커피"}).json()

    assert len(body["items"]) == 1
    assert Decimal(body["totals"]["expense"]) == Decimal("7000")


def test_creating_savings_transaction_leaves_partner_saving_notification(client, seeded_db):
    from app.models.category import Category
    from app.models.savings_product import SavingsProduct

    db = seeded_db["db"]
    savings_category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    product = SavingsProduct(name="적금", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"))
    db.add_all([savings_category, product])
    db.commit()

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
    items = client.get("/api/v1/notifications").json()["items"]
    partner = [n for n in items if n["notif_type"] == "partner_saving"]
    assert len(partner) == 1
    assert partner[0]["detail"] == 'Spouse 1님이 "적금"에 50,000원 저축했어요'
    # 기록한 본인에게는 읽음 처리돼 안 읽은 알림으로 잡히지 않는다
    assert partner[0]["is_read"] is True
