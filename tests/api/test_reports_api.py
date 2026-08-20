from datetime import date
from decimal import Decimal

from app.models.user import User
from app.services import transaction_service


def test_yearly_report_returns_monthly_and_breakdown(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("30000"), date(2026, 3, 10))

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
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("1000000"), date(2026, 3, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("200000"), date(2026, 3, 10))

    resp = client.get("/api/v1/reports/yearly", params={"year": 2026})

    assert resp.status_code == 200
    benchmark = resp.json()["benchmark"]
    assert len(benchmark) == 1
    assert benchmark[0]["group"] == "food"
    assert benchmark[0]["status"] == "warn"  # 20% > 기본 가이드라인(15%)
    assert Decimal(benchmark[0]["amount"]) == Decimal("200000")


def test_yearly_report_benchmark_empty_when_no_category_tagged(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("30000"), date(2026, 3, 10))

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
        db, user.id, food.id, "expense", Decimal("30000"), date(2026, 3, 6), owner_user_id=spouse2.id
    )
    transaction_service.create_transaction(
        db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 3, 1), owner_user_id=user.id
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
        db, user.id, food.id, "expense", Decimal("50000"), date(2026, 3, 6), owner_user_id=user.id
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("15000"), date(2026, 3, 12))

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
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("40000"), date.today())

    resp = client.get("/api/v1/reports/category-trend", params={"months": 3})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["months"]) == 3
    food_series = next(s for s in body["series"] if s["name"] == "식비")
    assert Decimal(food_series["amounts"][-1]) == Decimal("40000")
