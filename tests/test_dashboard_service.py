from datetime import date
from decimal import Decimal

from app.services import dashboard_service, transaction_service


def test_build_month_combines_totals_and_streak(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    today = date(2026, 8, 15)
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("2000000"), today)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("500000"), today)

    result = dashboard_service.build(db, period="month", year_month="2026-08", today=today)

    assert result["period"] == "month"
    assert result["start"] == date(2026, 8, 1)
    assert result["end"] == date(2026, 8, 31)
    assert result["current_ym"] == "2026-08"
    assert Decimal(str(result["totals"]["income"])) == Decimal("2000000")
    assert isinstance(result["insights"], list)
    assert isinstance(result["savings_streak_months"], int)


def test_build_today_uses_explicit_date(seeded_db):
    db = seeded_db["db"]
    result = dashboard_service.build(db, period="today", day="2026-03-09", today=date(2026, 8, 1))
    assert result["start"] == date(2026, 3, 9)
    assert result["end"] == date(2026, 3, 9)


def test_build_week_bounds_from_anchor(seeded_db):
    db = seeded_db["db"]
    result = dashboard_service.build(db, period="week", day="2026-08-12", today=date(2026, 8, 1))
    # 주 경계는 utils.dates.week_bounds가 결정 — 시작 <= anchor <= 끝
    assert result["start"] <= date(2026, 8, 12) <= result["end"]
