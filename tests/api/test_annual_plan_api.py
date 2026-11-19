from decimal import Decimal

import pytest


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


def test_upsert_unknown_id_is_404_not_a_silent_create(client):
    resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": 999,
            "year": 2026,
            "section": "fixed",
            "owner_user_id": None,
            "name": "관리비",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-12",
            "monthly_targets": [],
        },
    )
    assert resp.status_code == 404
    assert client.get("/api/v1/annual-plan", params={"year": 2026}).json()["items"] == []


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


def test_delete_item_404_when_missing(client):
    assert client.delete("/api/v1/annual-plan/items/99999").status_code == 404


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

    resp = client.get("/api/v1/annual-plan", params={"year": 2026})
    assert resp.status_code == 200
    rows = resp.json()["category_budgets"]
    food_row = next(r for r in rows if r["category_id"] == food.id)
    assert food_row["budget"] == "300000.00"


@pytest.mark.parametrize("year", [0, 1999, 2101, 10000])
def test_out_of_range_year_is_422_not_500(client, year):
    # date(year, 1, 1)이 되는 값 — 범위 밖이면 year_bounds에서 ValueError(500)가 났다.
    assert client.get("/api/v1/annual-plan", params={"year": year}).status_code == 422
    assert client.post("/api/v1/annual-plan/seed", json={"year": year, "source": "recurring"}).status_code == 422


def _item_payload(**overrides):
    payload = {
        "id": None,
        "year": 2026,
        "section": "income",
        "owner_user_id": None,
        "name": "월급",
        "category_id": None,
        "sort_order": 0,
        "start_month": "2026-01",
        "end_month": "2026-12",
        "monthly_targets": [{"year_month": "2026-01", "target_amount": "3000000"}],
    }
    return {**payload, **overrides}


@pytest.mark.parametrize(
    "overrides",
    [
        # 같은 달 두 번 — 저장하면 월별 유니크 제약에서 500이 났다
        {"monthly_targets": [{"year_month": "2026-03", "target_amount": "1"}, {"year_month": "2026-03", "target_amount": "2"}]},
        # 다른 해의 달 — 그 해 연간 화면엔 안 보이고 그 달 예산에만 합산됐다
        {"monthly_targets": [{"year_month": "2027-03", "target_amount": "1"}]},
        {"start_month": "2025-12"},
        {"start_month": "2026-09", "end_month": "2026-03"},
        {"monthly_targets": [{"year_month": f"2026-{m:02d}", "target_amount": "1"} for m in range(1, 13)] * 2},
    ],
)
def test_upsert_item_rejects_invalid_monthly_targets_with_422(client, overrides):
    assert client.put("/api/v1/annual-plan/items", json=_item_payload(**overrides)).status_code == 422


def test_seed_from_previous_year_then_409_when_year_has_items(client, frozen_today):
    """"새해 계획 시작" — 빈 해는 작년 항목을 월만 옮겨 채우고, 이미 항목이 있으면 덮어쓰지 않고 409."""
    client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2025,
            "section": "income",
            "owner_user_id": None,
            "name": "월급",
            "category_id": None,
            "sort_order": 0,
            "start_month": "2025-01",
            "end_month": "2025-12",
            "monthly_targets": [{"year_month": "2025-03", "target_amount": "3000000"}],
        },
    )

    resp = client.post("/api/v1/annual-plan/seed", json={"year": 2026, "source": "previous_year"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["year"] == 2026
    [item] = body["items"]
    assert item["name"] == "월급"
    assert [(t["year_month"], Decimal(t["target_amount"])) for t in item["monthly_targets"]] == [
        ("2026-03", Decimal("3000000"))
    ]

    again = client.post("/api/v1/annual-plan/seed", json={"year": 2026, "source": "recurring"})
    assert again.status_code == 409
    assert len(client.get("/api/v1/annual-plan", params={"year": 2026}).json()["items"]) == 1


def test_seed_rejects_unknown_source(client):
    assert client.post("/api/v1/annual-plan/seed", json={"year": 2026, "source": "magic"}).status_code == 422
