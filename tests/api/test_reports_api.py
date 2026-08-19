from datetime import date
from decimal import Decimal

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


def test_category_trend_returns_trailing_months_with_series(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("40000"), date.today())

    resp = client.get("/api/v1/reports/category-trend", params={"months": 3})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["months"]) == 3
    food_series = next(s for s in body["series"] if s["name"] == "식비")
    assert Decimal(food_series["amounts"][-1]) == Decimal("40000")
