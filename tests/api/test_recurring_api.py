from decimal import Decimal


def test_create_list_deactivate_recurring(client, seeded_db):
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "넷플릭스",
            "category_id": food.id,
            "amount": "17000",
            "frequency": "monthly",
            "start_date": "2026-07-01",
        },
    )
    assert resp.status_code == 201
    recurring_id = resp.json()["id"]

    list_resp = client.get("/api/v1/recurring")
    assert any(item["id"] == recurring_id for item in list_resp.json()["items"])

    deactivate_resp = client.post(f"/api/v1/recurring/{recurring_id}/deactivate")
    assert deactivate_resp.status_code == 204

    list_resp2 = client.get("/api/v1/recurring")
    assert all(item["id"] != recurring_id for item in list_resp2.json()["items"])


def test_update_recurring(client, seeded_db):
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "넷플릭스",
            "category_id": food.id,
            "amount": "17000",
            "frequency": "monthly",
            "start_date": "2026-07-01",
        },
    )
    recurring_id = resp.json()["id"]

    update_resp = client.put(f"/api/v1/recurring/{recurring_id}", json={"amount": "19000", "frequency": "yearly"})

    assert update_resp.status_code == 200
    body = update_resp.json()
    assert Decimal(body["amount"]) == Decimal("19000")
    assert body["frequency"] == "yearly"
    assert body["name"] == "넷플릭스"


def test_update_recurring_not_found_returns_404(client, seeded_db):
    resp = client.put("/api/v1/recurring/99999", json={"amount": "1000"})
    assert resp.status_code == 404


def test_create_recurring_defaults_to_expense_type(client, seeded_db):
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "넷플릭스",
            "category_id": food.id,
            "amount": "17000",
            "frequency": "monthly",
            "start_date": "2026-07-01",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["type"] == "expense"
    assert resp.json()["days_of_month"] is None


def test_create_recurring_income_with_multiple_days_of_month(client, seeded_db):
    salary = seeded_db["salary"]
    resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "월급",
            "category_id": salary.id,
            "amount": "3000000",
            "type": "income",
            "frequency": "monthly",
            "start_date": "2026-07-01",
            "days_of_month": [5, 25],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "income"
    assert body["days_of_month"] == [5, 25]
    assert body["next_due_date"] == "2026-07-05"


def test_create_recurring_rejects_invalid_days_of_month(client, seeded_db):
    food = seeded_db["food"]
    resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "잘못된 규칙",
            "category_id": food.id,
            "amount": "1000",
            "frequency": "monthly",
            "start_date": "2026-07-01",
            "days_of_month": [5, 35],
        },
    )
    assert resp.status_code == 422


def test_run_now_creates_due_transactions(client, seeded_db):
    food = seeded_db["food"]
    client.post(
        "/api/v1/recurring",
        json={
            "name": "구독료",
            "category_id": food.id,
            "amount": "5000",
            "frequency": "monthly",
            "start_date": "2026-07-01",
        },
    )

    resp = client.post("/api/v1/recurring/run-now")

    assert resp.status_code == 200
    assert resp.json()["created_count"] >= 1
