from datetime import date
from decimal import Decimal

from app.services import transaction_service


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
