from datetime import date
from decimal import Decimal

from app.services import transaction_service


def test_upsert_and_list_plan_item(client, seeded_db):
    user = seeded_db["user"]
    resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "fixed",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "월세",
            "amount": "800000",
            "sort_order": 0,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["year_month"] == "2026-07"
    assert body["prev_month"] == "2026-06"
    assert body["next_month"] == "2026-08"
    item = next(i for i in body["items"] if i["name"] == "월세")
    assert Decimal(item["amount"]) == Decimal("800000")
    assert Decimal(body["summary"]["fixed"]["planned"]) == Decimal("800000")

    list_resp = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"})
    assert list_resp.status_code == 200
    assert len(list_resp.json()["items"]) == 1


def test_upsert_plan_item_with_category_returns_category_name(client, seeded_db):
    food = seeded_db["food"]
    resp = client.put(
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
    assert resp.status_code == 200
    item = next(i for i in resp.json()["items"] if i["category_id"] == food.id)
    assert item["category_name"] == food.name
    assert item["category_color"] == food.color


def test_copy_previous_month(client, seeded_db):
    user = seeded_db["user"]
    client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "variable",
            "year_month": "2026-06",
            "owner_user_id": None,
            "name": "식료품비",
            "amount": "400000",
            "sort_order": 0,
        },
    )

    resp = client.post("/api/v1/cashflow-plan/copy-previous-month", json={"year_month": "2026-07"})

    assert resp.status_code == 200
    assert resp.json()["copied"] == 1

    list_resp = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"})
    assert len(list_resp.json()["items"]) == 1
    assert list_resp.json()["items"][0]["name"] == "식료품비"


def test_split_plan_item_creates_remaining_months_of_year(client, seeded_db):
    resp = client.post(
        "/api/v1/cashflow-plan/items/split",
        json={
            "section": "irregular",
            "owner_user_id": None,
            "name": "자동차보험료",
            "total_amount": "1200000",
            "start_year_month": "2026-07",
            "sort_order": 0,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 6  # 7,8,9,10,11,12월

    july = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"}).json()
    item = next(i for i in july["items"] if i["name"] == "자동차보험료")
    assert Decimal(item["amount"]) == Decimal("200000")
    assert item["installment_no"] == 1
    assert item["installment_total"] == 6
    assert Decimal(item["installment_total_amount"]) == Decimal("1200000")

    december = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-12"}).json()
    last_item = next(i for i in december["items"] if i["name"] == "자동차보험료")
    assert last_item["installment_no"] == 6

    next_january = client.get("/api/v1/cashflow-plan", params={"year_month": "2027-01"}).json()
    assert not any(i["name"] == "자동차보험료" for i in next_january["items"])


def test_split_plan_item_starting_january_covers_full_year(client, seeded_db):
    resp = client.post(
        "/api/v1/cashflow-plan/items/split",
        json={
            "section": "irregular",
            "owner_user_id": None,
            "name": "재산세",
            "total_amount": "1200000",
            "start_year_month": "2026-01",
            "sort_order": 0,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 12


def test_irregular_section_shows_actual_from_matching_category_transactions(client, seeded_db):
    user, events = seeded_db["user"], seeded_db["events"]
    transaction_service.create_transaction(
        seeded_db["db"], user.id, events.id, "expense", Decimal("150000"), date(2026, 7, 12)
    )
    client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "irregular",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "경조사비",
            "amount": "200000",
            "sort_order": 0,
        },
    )

    resp = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"})

    irregular = resp.json()["summary"]["irregular"]
    assert Decimal(irregular["actual"]) == Decimal("150000")
    assert irregular["pct"] == 75.0
    assert irregular["status"] == "ok"


def test_link_recurring_endpoint_success(client, seeded_db):
    rent = seeded_db["rent"]
    plan_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "fixed",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "월세",
            "amount": "800000",
            "category_id": rent.id,
            "sort_order": 0,
        },
    )
    item_id = plan_resp.json()["items"][0]["id"]
    recurring_resp = client.post(
        "/api/v1/recurring",
        json={
            "name": "월세",
            "category_id": rent.id,
            "amount": "800000",
            "frequency": "monthly",
            "start_date": "2026-07-05",
        },
    )
    recurring_id = recurring_resp.json()["id"]

    link_resp = client.post(
        f"/api/v1/cashflow-plan/items/{item_id}/link-recurring", json={"recurring_expense_id": recurring_id}
    )

    assert link_resp.status_code == 200
    item = next(i for i in link_resp.json()["items"] if i["id"] == item_id)
    assert item["recurring_expense_id"] == recurring_id
    assert item["recurring_active"] is True


def test_link_recurring_endpoint_409_when_already_linked(client, seeded_db):
    rent = seeded_db["rent"]
    plan_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "fixed",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "월세",
            "amount": "800000",
            "category_id": rent.id,
            "sort_order": 0,
        },
    )
    item_id = plan_resp.json()["items"][0]["id"]
    first = client.post(
        "/api/v1/recurring",
        json={
            "name": "월세",
            "category_id": rent.id,
            "amount": "800000",
            "frequency": "monthly",
            "start_date": "2026-07-05",
        },
    ).json()
    second = client.post(
        "/api/v1/recurring",
        json={
            "name": "월세2",
            "category_id": rent.id,
            "amount": "800000",
            "frequency": "monthly",
            "start_date": "2026-07-05",
        },
    ).json()
    client.post(f"/api/v1/cashflow-plan/items/{item_id}/link-recurring", json={"recurring_expense_id": first["id"]})

    resp = client.post(
        f"/api/v1/cashflow-plan/items/{item_id}/link-recurring", json={"recurring_expense_id": second["id"]}
    )

    assert resp.status_code == 409


def test_link_recurring_endpoint_404_for_missing_item(client, seeded_db):
    resp = client.post(
        "/api/v1/cashflow-plan/items/999999/link-recurring", json={"recurring_expense_id": 1}
    )
    assert resp.status_code == 404


def test_link_recurring_endpoint_404_for_missing_recurring_expense(client, seeded_db):
    plan_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "fixed",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "월세",
            "amount": "800000",
            "sort_order": 0,
        },
    )
    item_id = plan_resp.json()["items"][0]["id"]

    resp = client.post(
        f"/api/v1/cashflow-plan/items/{item_id}/link-recurring", json={"recurring_expense_id": 999999}
    )

    assert resp.status_code == 404


def test_annual_plan_monthly_target_auto_fills_month_with_no_plan_item(client, seeded_db):
    rent = seeded_db["rent"]
    annual_resp = client.put(
        "/api/v1/annual-plan/items",
        json={
            "id": None,
            "year": 2026,
            "section": "fixed",
            "owner_user_id": None,
            "name": "월세",
            "category_id": rent.id,
            "sort_order": 0,
            "start_month": "2026-01",
            "end_month": "2026-12",
            "monthly_targets": [{"year_month": "2026-07", "target_amount": "800000"}],
        },
    )
    annual_item_id = annual_resp.json()["items"][0]["id"]

    resp = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["id"] is None
    assert item["from_annual_plan"] is True
    assert item["annual_plan_item_id"] == annual_item_id
    assert Decimal(item["amount"]) == Decimal("800000")
    assert Decimal(body["summary"]["fixed"]["planned"]) == Decimal("800000")

    # Editing/saving the auto-filled item promotes it to a real, independently-owned plan item.
    save_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": item["id"],
            "section": item["section"],
            "year_month": "2026-07",
            "owner_user_id": item["owner_user_id"],
            "name": item["name"],
            "amount": "900000",
            "category_id": item["category_id"],
            "sort_order": item["sort_order"],
        },
    )
    saved_item = save_resp.json()["items"][0]
    assert saved_item["id"] is not None
    assert saved_item["from_annual_plan"] is False
    assert saved_item["annual_plan_item_id"] is None
    assert Decimal(saved_item["amount"]) == Decimal("900000")


def test_delete_plan_item(client, seeded_db):
    put_resp = client.put(
        "/api/v1/cashflow-plan/items",
        json={
            "id": None,
            "section": "irregular",
            "year_month": "2026-07",
            "owner_user_id": None,
            "name": "휴가비",
            "amount": "500000",
            "sort_order": 0,
        },
    )
    item_id = put_resp.json()["items"][0]["id"]

    del_resp = client.delete(f"/api/v1/cashflow-plan/items/{item_id}")
    assert del_resp.status_code == 204

    list_resp = client.get("/api/v1/cashflow-plan", params={"year_month": "2026-07"})
    assert list_resp.json()["items"] == []
