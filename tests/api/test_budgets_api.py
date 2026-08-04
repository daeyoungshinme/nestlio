from decimal import Decimal


def test_list_budgets_reflects_category_tagged_plan_items(client, seeded_db):
    food = seeded_db["food"]
    put_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": food.type,
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": food.name,
            "amount": "300000",
            "category_id": food.id,
            "sort_order": 0,
        },
    )
    assert put_resp.status_code == 200

    list_resp = client.get("/api/v1/budgets", params={"year_month": "2026-07"})
    assert list_resp.status_code == 200
    row = next(r for r in list_resp.json()["rows"] if r["category_id"] == food.id)
    assert Decimal(row["budget"]) == Decimal("300000")
    assert list_resp.json()["prev_month"] == "2026-06"
    assert list_resp.json()["next_month"] == "2026-08"


def test_copy_previous_month_via_cashflow_plan_copies_category_tagged_items(client, seeded_db):
    food = seeded_db["food"]
    client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": food.type,
            "year_month": "2026-06",
            "owner_user_id": None,
            "name": food.name,
            "amount": "150000",
            "category_id": food.id,
            "sort_order": 0,
        },
    )

    resp = client.post("/api/v1/cashflow-plan/copy-previous-month", json={"year_month": "2026-07"})
    assert resp.status_code == 200
    assert resp.json()["copied"] == 1

    list_resp = client.get("/api/v1/budgets", params={"year_month": "2026-07"})
    row = next(r for r in list_resp.json()["rows"] if r["category_id"] == food.id)
    assert Decimal(row["budget"]) == Decimal("150000")
