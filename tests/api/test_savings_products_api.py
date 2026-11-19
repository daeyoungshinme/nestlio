from decimal import Decimal
from unittest.mock import patch

import pytest


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
    create_resp = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    product_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/savings-products/{product_id}/sync")

    assert resp.status_code == 409


def test_sync_updates_balance(client, seeded_db):
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
        "app.services.savings_product_growlio_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 555000.0}],
    ):
        resp = client.post(f"/api/v1/savings-products/{product_id}/sync")

    assert resp.status_code == 200
    assert resp.json()["current_balance"] == "555000.00"
    assert resp.json()["last_synced_at"] is not None


def test_list_growlio_accounts_proxies_client(client, seeded_db):

    with patch(
        "app.services.savings_product_growlio_service.growlio_client.fetch_account_balances",
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

    with patch(
        "app.services.savings_product_growlio_service.growlio_client.fetch_account_balances",
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


@pytest.mark.parametrize("year", [0, 10000])
def test_annual_plan_summary_out_of_range_year_is_422(client, year):
    assert client.get("/api/v1/savings-products/annual-plan", params={"year": year}).status_code == 422


@pytest.mark.parametrize(
    "monthly_targets",
    [
        [{"year_month": "2026-06", "target_amount": "1"}, {"year_month": "2026-06", "target_amount": "2"}],
        [{"year_month": "2027-01", "target_amount": "1"}],
    ],
)
def test_upsert_annual_plan_rejects_duplicate_or_other_year_months_with_422(client, seeded_db, monthly_targets):
    product_id = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "100000", "product_type": "savings"},
    ).json()["id"]

    resp = client.put(
        f"/api/v1/savings-products/{product_id}/annual-plan",
        json={"year": 2026, "start_month": "2026-01", "end_month": "2026-12", "monthly_targets": monthly_targets},
    )

    assert resp.status_code == 422


def test_update_product_maps_every_field_to_its_own_column(client, seeded_db):
    """라우터가 서비스에 위치 인자 7개를 넘긴다 — 순서가 어긋나면(잔액↔월 저축액 등) 값이 엉뚱한 칸에 저장된다.
    필드마다 다른 값을 넣어 각각 제자리로 가는지 본다."""
    product_id = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    ).json()["id"]
    owner_id = str(seeded_db["user"].id)

    resp = client.put(
        f"/api/v1/savings-products/{product_id}",
        json={
            "name": "펀드로 변경",
            "current_balance": "1500000",
            "monthly_saving_amount": "200000",
            "product_type": "investment",
            "principal_amount": "1000000",
            "owner_user_id": owner_id,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "펀드로 변경"
    assert Decimal(body["current_balance"]) == Decimal("1500000")
    assert Decimal(body["monthly_saving_amount"]) == Decimal("200000")
    assert body["product_type"] == "investment"
    assert Decimal(body["principal_amount"]) == Decimal("1000000")
    assert body["owner_user_id"] == owner_id


def test_update_product_404_when_missing(client):
    resp = client.put(
        "/api/v1/savings-products/9999",
        json={"name": "x", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    )
    assert resp.status_code == 404


def test_sync_all_reports_synced_and_failed_products(client, seeded_db):
    """연동된 상품만 동기화하고, growlio 목록에 없는(배우자 소유 등) 상품은 실패 목록에 담아 나머지를 계속한다."""
    ids = []
    for name, account_id in [("적금", "growlio-acc-1"), ("배우자 적금", "growlio-acc-2"), ("연동 안 함", None)]:
        product_id = client.post(
            "/api/v1/savings-products",
            json={"name": name, "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
        ).json()["id"]
        if account_id:
            client.put(
                f"/api/v1/savings-products/{product_id}/growlio-link",
                json={"growlio_account_id": account_id, "auto_sync_enabled": True},
            )
        ids.append(product_id)

    with patch(
        "app.services.savings_product_growlio_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민 자유적금", "asset_type": "DEPOSIT", "current_value_krw": 555000.0}],
    ) as fetch:
        resp = client.post("/api/v1/savings-products/sync-all")

    assert resp.status_code == 200
    body = resp.json()
    assert body["synced_count"] == 1
    assert [f["id"] for f in body["failed"]] == [ids[1]]
    fetch.assert_called_once()  # 목록은 한 번만 조회해 여러 상품에 매칭한다
    balances = {p["id"]: Decimal(p["current_balance"]) for p in client.get("/api/v1/savings-products").json()}
    assert balances[ids[0]] == Decimal("555000")
    assert balances[ids[2]] == Decimal("0")


def test_sync_all_without_linked_products_skips_growlio(client):
    with patch("app.services.savings_product_growlio_service.growlio_client.fetch_account_balances") as fetch:
        resp = client.post("/api/v1/savings-products/sync-all")
    assert resp.status_code == 200
    assert resp.json() == {"synced_count": 0, "failed": []}
    fetch.assert_not_called()


def test_plan_summary_for_month(client):
    client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "300000", "product_type": "savings"},
    )
    client.post(
        "/api/v1/savings-products",
        json={"name": "펀드", "current_balance": "0", "monthly_saving_amount": "100000", "product_type": "investment"},
    )

    resp = client.get("/api/v1/savings-products/plan", params={"year_month": "2026-07"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["year_month"] == "2026-07"
    planned = {item["name"]: Decimal(item["planned"]) for item in body["items"]}
    assert planned == {"적금": Decimal("300000"), "펀드": Decimal("100000")}
    assert Decimal(body["savings"]["planned"]) == Decimal("300000")
    assert Decimal(body["investment"]["planned"]) == Decimal("100000")


def test_plan_summary_rejects_malformed_year_month(client):
    assert client.get("/api/v1/savings-products/plan", params={"year_month": "2026-13"}).status_code == 422
