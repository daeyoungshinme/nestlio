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


def test_category_trend_returns_trailing_months_with_series(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("40000"), date.today())

    resp = client.get("/api/v1/reports/category-trend", params={"months": 3})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["months"]) == 3
    food_series = next(s for s in body["series"] if s["name"] == "식비")
    assert Decimal(food_series["amounts"][-1]) == Decimal("40000")
