from datetime import date
from decimal import Decimal

from app.services import goal_service, transaction_service
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
    # create_transaction() was called without owner_user_id, so it lands in the "공통"
    # (shared) bucket rather than under Spouse 1 - owner_totals always includes both.
    assert body["owner_totals"] == [
        {
            "owner_user_id": str(user.id),
            "display_name": "Spouse 1",
            "income": "0",
            "expense": "0",
            "savings": "0",
            "savings_investment": "0",
        },
        {
            "owner_user_id": None,
            "display_name": "공통",
            "income": "100000.00",
            "expense": "0",
            "savings": "100000.00",
            "savings_investment": "0",
        },
    ]
    assert set(body["surplus_allocation"].keys()) == {"emergency_fund_portion", "investable_portion"}


def test_dashboard_defaults_to_month_period(client):
    resp = client.get("/api/v1/dashboard")
    assert resp.status_code == 200
    assert resp.json()["period"] == "month"


def test_dashboard_includes_savings_streak_by_default(client):
    resp = client.get("/api/v1/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["savings_streak_months"] == 0


def test_dashboard_savings_streak_reflects_consecutive_goal_pace_months(client, seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    goal_service.create_goal(db, 1, "여행자금", None, Decimal("10000000"), Decimal("500000"))
    today = date.today()
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("2000000"), today)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), today)

    resp = client.get("/api/v1/dashboard")

    assert resp.status_code == 200
    assert resp.json()["savings_streak_months"] == 1


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
    assert body["owner_totals"][0]["display_name"] == "Spouse 1"
    assert body["top_categories"][0]["name"] == "식비"
