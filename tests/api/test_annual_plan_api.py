from decimal import Decimal


def test_create_and_list_items(client):
    resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2026,
            "section": "income",
            "owner_user_id": None,
            "name": "월급",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-12",
            "monthly_targets": [
                {"year_month": "2026-01", "target_amount": "3000000"},
                {"year_month": "2026-02", "target_amount": "3000000"},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["year"] == 2026
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["name"] == "월급"
    assert item["start_month"] == "2026-01"
    assert item["end_month"] == "2026-12"
    assert item["annual_target"] == "6000000.00"
    assert len(item["monthly_targets"]) == 2
    assert "income" in body["summary"]  # today 기준 elapsed_months 계산의 상세 검증은 서비스 레벨 테스트가 담당


def test_create_item_with_partial_period(client):
    resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2026,
            "section": "income",
            "owner_user_id": None,
            "name": "상여금",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-02",
            "monthly_targets": [
                {"year_month": "2026-01", "target_amount": "500000"},
                {"year_month": "2026-02", "target_amount": "500000"},
            ],
        },
    )
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["start_month"] == "2026-01"
    assert item["end_month"] == "2026-02"
    assert item["annual_target"] == "1000000.00"
    assert len(item["monthly_targets"]) == 2


def test_update_item(client):
    create_resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2026,
            "section": "fixed",
            "owner_user_id": None,
            "name": "관리비",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-12",
            "monthly_targets": [{"year_month": "2026-01", "target_amount": "200000"}],
        },
    )
    item_id = create_resp.json()["items"][0]["id"]

    update_resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": item_id,
            "year": 2026,
            "section": "fixed",
            "owner_user_id": None,
            "name": "관리비(수정)",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-02",
            "monthly_targets": [
                {"year_month": "2026-01", "target_amount": "250000"},
                {"year_month": "2026-02", "target_amount": "250000"},
            ],
        },
    )
    assert update_resp.status_code == 200
    items = update_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "관리비(수정)"
    assert items[0]["start_month"] == "2026-01"
    assert items[0]["end_month"] == "2026-02"
    assert items[0]["annual_target"] == "500000.00"


def test_delete_item(client):
    create_resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2026,
            "section": "irregular",
            "owner_user_id": None,
            "name": "경조사",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-12",
            "monthly_targets": [],
        },
    )
    item_id = create_resp.json()["items"][0]["id"]

    resp = client.delete(f"/api/v1/annual-plan/items/{item_id}")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/annual-plan", params={"year": 2026})
    assert list_resp.json()["items"] == []


def test_get_plan_returns_all_four_section_summaries(client):
    resp = client.get("/api/v1/annual-plan", params={"year": 2026})
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert set(summary.keys()) == {"income", "fixed", "variable", "irregular", "expense_total", "available"}


def test_category_budgets_endpoint(client, seeded_db):
    db, food = seeded_db["db"], seeded_db["food"]
    from app.services import annual_plan_service

    annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "variable",
        None,
        "식비",
        food.id,
        0,
        seeded_db["user"].id,
        "2026-01",
        "2026-12",
        monthly_targets=[{"year_month": "2026-01", "target_amount": Decimal("300000")}],
    )

    resp = client.get("/api/v1/annual-plan/category-budgets", params={"year": 2026})
    assert resp.status_code == 200
    rows = resp.json()
    food_row = next(r for r in rows if r["category_id"] == food.id)
    assert food_row["budget"] == "300000.00"
