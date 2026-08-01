from datetime import date
from decimal import Decimal

from app.services import budget_service, transaction_service
from app.utils.dates import year_month_str


def _add_tx(db, user, category, amount, tx_date):
    return transaction_service.create_transaction(
        db,
        user_id=user.id,
        category_id=category.id,
        type_="expense",
        amount=Decimal(amount),
        transaction_date=tx_date,
    )


def test_budget_vs_actual_percentage(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    budget_service.upsert_budget(db, food.id, ym, Decimal("100000"), user.id)
    _add_tx(db, user, food, "60000", date(2026, 7, 5))
    _add_tx(db, user, food, "30000", date(2026, 7, 20))

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["actual"] == Decimal("90000")
    assert food_row["pct"] == 90.0
    assert food_row["status"] == "warn"  # >= 90% warn threshold


def test_budget_vs_actual_critical_at_100(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    budget_service.upsert_budget(db, food.id, ym, Decimal("50000"), user.id)
    _add_tx(db, user, food, "50000", date(2026, 7, 5))

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["pct"] == 100.0
    assert food_row["status"] == "critical"


def test_budget_vs_actual_no_spend_is_ok(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    budget_service.upsert_budget(db, food.id, ym, Decimal("50000"), user.id)

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["actual"] == Decimal("0")
    assert food_row["pct"] == 0.0
    assert food_row["status"] == "ok"


def test_copy_from_previous_month_skips_existing(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    july = year_month_str(date(2026, 7, 15))
    august = year_month_str(date(2026, 8, 15))
    budget_service.upsert_budget(db, food.id, july, Decimal("100000"), user.id)
    budget_service.upsert_budget(db, rent.id, july, Decimal("800000"), user.id)
    budget_service.upsert_budget(db, rent.id, august, Decimal("900000"), user.id)  # already set, should not be overwritten

    copied = budget_service.copy_from_previous_month(db, august, user.id)

    august_budgets = budget_service.get_budgets_for_month(db, august)
    assert copied == 1  # only food was missing
    assert august_budgets[food.id].amount == Decimal("100000")
    assert august_budgets[rent.id].amount == Decimal("900000")  # untouched
