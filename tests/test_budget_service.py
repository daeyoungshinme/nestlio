from datetime import date
from decimal import Decimal

from app.services import budget_service, cashflow_plan_service, recurring_service, transaction_service
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


def _set_budget(db, category, year_month, amount, updated_by, name=None):
    return cashflow_plan_service.upsert_item(
        db, None, category.type, None, name or category.name, Decimal(amount), 0, year_month, updated_by,
        category_id=category.id,
    )


def test_budget_vs_actual_percentage(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    _set_budget(db, food, ym, "100000", user.id)
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
    _set_budget(db, food, ym, "50000", user.id)
    _add_tx(db, user, food, "50000", date(2026, 7, 5))

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["pct"] == 100.0
    assert food_row["status"] == "critical"


def test_budget_vs_actual_no_spend_is_ok(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    _set_budget(db, food, ym, "50000", user.id)

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["actual"] == Decimal("0")
    assert food_row["pct"] == 0.0
    assert food_row["status"] == "ok"


def test_budget_vs_actual_sums_multiple_items_tagged_to_same_category(seeded_db):
    """Two differently-named plan items both tagged with the same category (e.g. two subscriptions
    under "식비") should sum into a single budget cap for that category."""
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    _set_budget(db, food, ym, "70000", user.id, name="외식")
    _set_budget(db, food, ym, "30000", user.id, name="배달")
    _add_tx(db, user, food, "90000", date(2026, 7, 5))

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["pct"] == 90.0  # 90000 / (70000+30000)
    assert food_row["status"] == "warn"


def test_budget_reflects_updated_recurring_amount_for_linked_item(seeded_db):
    """get_budgets_for_month is a raw SQL aggregate, so it must join through to the linked recurring
    expense too - not just the Python-side amount property that cashflow_plan_service uses."""
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    item = _set_budget(db, food, ym, "70000", user.id)
    recurring = recurring_service.create_recurring(
        db, name="식비", category_id=food.id, amount=Decimal("70000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    cashflow_plan_service.link_recurring(db, item.id, recurring.id)

    recurring_service.update_recurring(db, recurring.id, amount=Decimal("120000"))

    budgets = budget_service.get_budgets_for_month(db, ym)
    assert budgets[food.id] == Decimal("120000")


def test_budget_vs_actual_suggested_amount_is_trailing_average(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _add_tx(db, user, food, "150000", date(2026, 4, 5))
    _add_tx(db, user, food, "100000", date(2026, 5, 5))
    _add_tx(db, user, food, "200000", date(2026, 6, 5))
    ym = year_month_str(date(2026, 7, 15))
    _set_budget(db, food, ym, "100000", user.id)

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["suggested_amount"] == Decimal("150000")  # (150000+100000+200000)/3


def test_budget_vs_actual_suggested_amount_is_none_without_history(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = year_month_str(date(2026, 7, 15))
    _set_budget(db, food, ym, "50000", user.id)

    rows = budget_service.budget_vs_actual(db, ym)
    food_row = next(r for r in rows if r["category_id"] == food.id)

    assert food_row["suggested_amount"] is None


def test_copy_from_previous_month_skips_existing(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    july = year_month_str(date(2026, 7, 15))
    august = year_month_str(date(2026, 8, 15))
    _set_budget(db, food, july, "100000", user.id)
    _set_budget(db, rent, july, "800000", user.id)
    _set_budget(db, rent, august, "900000", user.id)  # already set, should not be overwritten

    copied = cashflow_plan_service.copy_from_previous_month(db, august, user.id)

    august_budgets = budget_service.get_budgets_for_month(db, august)
    assert copied == 1  # only food was missing
    assert august_budgets[food.id] == Decimal("100000")
    assert august_budgets[rent.id] == Decimal("900000")  # untouched
