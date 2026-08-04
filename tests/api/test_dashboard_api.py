from datetime import date
from decimal import Decimal

from app.services import transaction_service
from app.utils.dates import month_bounds, shift_month, year_month_str


def test_dashboard_today_returns_totals_and_insights(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    today = date.today()
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("100000"), today)

    resp = client.get("/api/v1/dashboard", params={"period": "today"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["period"] == "today"
    assert Decimal(body["totals"]["income"]) == Decimal("100000")
    assert isinstance(body["insights"], list)
    assert body["by_user"] == [
        {
            "user_id": str(user.id),
            "display_name": "Spouse 1",
            "income": "100000.00",
            "expense": "0",
            "savings": "100000.00",
        }
    ]


def test_dashboard_defaults_to_month_period(client):
    resp = client.get("/api/v1/dashboard")
    assert resp.status_code == 200
    assert resp.json()["period"] == "month"


def test_monthly_retrospective_summarizes_previous_completed_month(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    prev_start, _ = month_bounds(shift_month(date.today(), -1))
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("50000"), prev_start)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("20000"), prev_start)

    resp = client.get("/api/v1/dashboard/monthly-retrospective")

    assert resp.status_code == 200
    body = resp.json()
    assert body["year_month"] == year_month_str(prev_start)
    assert Decimal(body["totals"]["income"]) == Decimal("50000")
    assert Decimal(body["totals"]["expense"]) == Decimal("20000")
    assert body["by_user"][0]["display_name"] == "Spouse 1"
    assert body["top_categories"][0]["name"] == "식비"
