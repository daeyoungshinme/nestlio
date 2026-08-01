from decimal import Decimal


def test_upsert_and_list_budget(client, seeded_db):
    food = seeded_db["food"]
    resp = client.put(
        "/api/v1/budgets",
        json={"year_month": "2026-07", "category_id": food.id, "amount": "300000"},
    )
    assert resp.status_code == 200
    row = next(r for r in resp.json()["rows"] if r["category_id"] == food.id)
    assert Decimal(row["budget"]) == Decimal("300000")

    list_resp = client.get("/api/v1/budgets", params={"year_month": "2026-07"})
    assert list_resp.status_code == 200
    assert list_resp.json()["prev_month"] == "2026-06"
    assert list_resp.json()["next_month"] == "2026-08"


def test_copy_previous_month(client, seeded_db):
    food = seeded_db["food"]
    client.put("/api/v1/budgets", json={"year_month": "2026-06", "category_id": food.id, "amount": "150000"})

    resp = client.post("/api/v1/budgets/copy-previous-month", json={"year_month": "2026-07"})

    assert resp.status_code == 200
    assert resp.json()["copied"] == 1
