from datetime import date
from decimal import Decimal

from app.services import dashboard_service, transaction_service


def test_build_month_combines_totals_and_streak(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    today = date(2026, 8, 15)
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("2000000"), today)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("500000"), today)

    result = dashboard_service.build(db, year_month="2026-08", today=today)

    assert result["start"] == date(2026, 8, 1)
    assert result["end"] == date(2026, 8, 31)
    assert result["current_ym"] == "2026-08"
    assert Decimal(str(result["totals"]["income"])) == Decimal("2000000")
    assert isinstance(result["insights"], list)
    assert isinstance(result["savings_streak_months"], int)


def test_build_defaults_to_current_month(seeded_db):
    result = dashboard_service.build(seeded_db["db"], today=date(2026, 3, 9))
    assert (result["start"], result["end"]) == (date(2026, 3, 1), date(2026, 3, 31))
