from datetime import date
from decimal import Decimal

from app.models.user import User
from app.services import transaction_service
from app.utils.dates import today_kst


def test_yearly_report_returns_monthly_and_breakdown(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("30000"), transaction_date=date(2026, 3, 10))

    resp = client.get("/api/v1/reports/yearly", params={"year": 2026})

    assert resp.status_code == 200
    body = resp.json()
    assert body["year"] == 2026
    assert body["prev_year"] == 2025
    assert len(body["monthly"]) == 12
    march = next(row for row in body["monthly"] if row["year_month"] == "2026-03")
    assert Decimal(march["expense"]) == Decimal("30000")


def test_yearly_report_benchmark_reflects_tagged_categories(client, seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]
    food.benchmark_group = "food"
    db.commit()
    transaction_service.create_transaction(db, user_id=user.id, category_id=salary.id, type_="income", amount=Decimal("1000000"), transaction_date=date(2026, 3, 1))
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("200000"), transaction_date=date(2026, 3, 10))

    resp = client.get("/api/v1/reports/yearly", params={"year": 2026})

    assert resp.status_code == 200
    benchmark = resp.json()["benchmark"]
    assert len(benchmark) == 1
    assert benchmark[0]["group"] == "food"
    assert benchmark[0]["status"] == "warn"  # 20% > 기본 가이드라인(15%)
    assert Decimal(benchmark[0]["amount"]) == Decimal("200000")


def test_yearly_report_benchmark_empty_when_no_category_tagged(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("30000"), transaction_date=date(2026, 3, 10))

    resp = client.get("/api/v1/reports/yearly", params={"year": 2026})

    assert resp.status_code == 200
    assert resp.json()["benchmark"] == []


def test_yearly_report_breakdown_filters_by_owner(client, seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    spouse2 = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse2)
    db.commit()
    db.refresh(spouse2)
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("30000"), transaction_date=date(2026, 3, 6), owner_user_id=spouse2.id
    )
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("800000"), transaction_date=date(2026, 3, 1), owner_user_id=user.id
    )

    resp_owner = client.get("/api/v1/reports/yearly", params={"year": 2026, "owner": str(spouse2.id)})
    resp_all = client.get("/api/v1/reports/yearly", params={"year": 2026})

    assert resp_owner.status_code == 200
    owner_breakdown = resp_owner.json()["breakdown"]
    assert len(owner_breakdown) == 1
    assert Decimal(owner_breakdown[0]["amount"]) == Decimal("30000")
    assert len(resp_all.json()["breakdown"]) == 2


def test_yearly_report_breakdown_filters_by_shared_owner(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("50000"), transaction_date=date(2026, 3, 6), owner_user_id=user.id
    )
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("15000"), transaction_date=date(2026, 3, 12))

    resp = client.get("/api/v1/reports/yearly", params={"year": 2026, "owner": "shared"})

    assert resp.status_code == 200
    breakdown = resp.json()["breakdown"]
    assert len(breakdown) == 1
    assert Decimal(breakdown[0]["amount"]) == Decimal("15000")


def test_yearly_report_rejects_invalid_owner_param(client):
    resp = client.get("/api/v1/reports/yearly", params={"year": 2026, "owner": "not-a-uuid"})
    assert resp.status_code == 422


def test_category_trend_returns_trailing_months_with_series(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("40000"), transaction_date=today_kst())

    resp = client.get("/api/v1/reports/category-trend", params={"months": 3})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["months"]) == 3
    food_series = next(s for s in body["series"] if s["name"] == "식비")
    assert Decimal(food_series["amounts"][-1]) == Decimal("40000")


def test_savings_review_returns_spending_items(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("100000"), transaction_date=date(2026, 8, 10))
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("150000"), transaction_date=date(2026, 9, 10))

    resp = client.get("/api/v1/reports/savings-review", params={"year_month": "2026-09"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["year_month"] == "2026-09"
    assert body["spending"]["items"][0]["rule_code"] == "trend_up"
    assert Decimal(body["total_estimated_monthly_saving"]) == Decimal("50000")


def test_savings_review_rejects_bad_params(client):
    assert client.get("/api/v1/reports/savings-review", params={"year_month": "2026-9"}).status_code == 422
    assert client.get("/api/v1/reports/savings-review", params={"owner": "nope"}).status_code == 422


def test_savings_review_includes_insurance(client, seeded_db):
    resp = client.post(
        "/api/v1/insurance-policies",
        json={"name": "실손A", "policy_type": "indemnity", "insured_name": "아이", "premium_amount": "30000"},
    )
    assert resp.status_code == 201
    client.post(
        "/api/v1/insurance-policies",
        json={"name": "실손B", "policy_type": "indemnity", "insured_name": "아이", "premium_amount": "20000"},
    )

    body = client.get("/api/v1/reports/savings-review", params={"year_month": "2026-09"}).json()

    assert body["insurance"]["summary"]["policies_count"] == 2
    assert body["insurance"]["findings"][0]["rule_code"] == "indemnity_duplicate"
    assert Decimal(body["total_estimated_monthly_saving"]) == Decimal("20000")


def test_owner_query_accepts_all_shared_uuid_and_rejects_others(client, seeded_db):
    user_id = seeded_db["user"].id
    for owner in ("all", "shared", str(user_id)):
        assert client.get("/api/v1/reports/yearly", params={"year": 2026, "owner": owner}).status_code == 200
    assert client.get("/api/v1/reports/yearly", params={"owner": "nobody"}).status_code == 422
    assert client.get("/api/v1/reports/savings-review", params={"owner": "nobody"}).status_code == 422
