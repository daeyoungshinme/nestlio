from datetime import date
from decimal import Decimal

from app.models.user import User
from app.services import transaction_service


def test_period_totals_splits_fixed_and_variable(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]

    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("50000"), date(2026, 7, 10))
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("3000000"), date(2026, 7, 25))

    totals = transaction_service.period_totals(db, date(2026, 7, 1), date(2026, 7, 31))

    assert totals["income"] == Decimal("3000000")
    assert totals["expense"] == Decimal("850000")
    assert totals["fixed"] == Decimal("800000")
    assert totals["variable"] == Decimal("50000")
    assert totals["irregular"] == Decimal("0")
    assert totals["savings"] == Decimal("2150000")


def test_period_totals_splits_irregular_separately(seeded_db):
    db, user, rent, events = seeded_db["db"], seeded_db["user"], seeded_db["rent"], seeded_db["events"]

    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, events.id, "expense", Decimal("150000"), date(2026, 7, 12))

    totals = transaction_service.period_totals(db, date(2026, 7, 1), date(2026, 7, 31))

    assert totals["expense"] == Decimal("950000")
    assert totals["fixed"] == Decimal("800000")
    assert totals["variable"] == Decimal("0")
    assert totals["irregular"] == Decimal("150000")


def test_period_totals_excludes_out_of_range_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]

    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 6, 30))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("20000"), date(2026, 7, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("30000"), date(2026, 8, 1))

    totals = transaction_service.period_totals(db, date(2026, 7, 1), date(2026, 7, 31))

    assert totals["expense"] == Decimal("20000")


def test_totals_by_user_splits_per_spouse(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    spouse2 = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse2)
    db.commit()
    db.refresh(spouse2)

    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("50000"), date(2026, 7, 5))
    transaction_service.create_transaction(db, user.id, rent.id, "income", Decimal("2000000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, spouse2.id, food.id, "expense", Decimal("30000"), date(2026, 7, 6))

    by_user = transaction_service.totals_by_user(db, date(2026, 7, 1), date(2026, 7, 31))

    by_name = {row["display_name"]: row for row in by_user}
    assert by_name["Spouse 1"]["expense"] == Decimal("50000")
    assert by_name["Spouse 1"]["income"] == Decimal("2000000")
    assert by_name["Spouse 1"]["savings"] == Decimal("1950000")
    assert by_name["Spouse 2"]["expense"] == Decimal("30000")
    assert by_name["Spouse 2"]["income"] == Decimal("0")
    assert by_name["Spouse 2"]["savings"] == Decimal("-30000")


def test_totals_by_user_excludes_users_with_no_transactions_in_range(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    spouse2 = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse2)
    db.commit()
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 5))

    by_user = transaction_service.totals_by_user(db, date(2026, 7, 1), date(2026, 7, 31))

    assert len(by_user) == 1
    assert by_user[0]["display_name"] == "Spouse 1"


def test_monthly_trend_orders_oldest_first(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 15))

    trend = transaction_service.monthly_trend(db, months=3, anchor=date(2026, 7, 20))

    assert [row["year_month"] for row in trend] == ["2026-05", "2026-06", "2026-07"]
    assert trend[-1]["expense"] == Decimal("10000")
    assert trend[0]["expense"] == Decimal("0")


def test_category_monthly_trend_orders_oldest_first_and_fills_gaps(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("50000"), date(2026, 6, 10))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2026, 7, 1))

    trend = transaction_service.category_monthly_trend(db, months=3, anchor=date(2026, 7, 20))

    assert trend["months"] == ["2026-05", "2026-06", "2026-07"]
    by_name = {s["name"]: s["amounts"] for s in trend["series"]}
    assert by_name["식비"] == [Decimal("0"), Decimal("50000"), Decimal("0")]
    assert by_name["주거비"] == [Decimal("0"), Decimal("0"), Decimal("800000")]


def test_category_monthly_trend_folds_extra_categories_into_other(seeded_db):
    db, user, food, rent, events = (
        seeded_db["db"],
        seeded_db["user"],
        seeded_db["food"],
        seeded_db["rent"],
        seeded_db["events"],
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("300000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("200000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, events.id, "expense", Decimal("100000"), date(2026, 7, 1))

    trend = transaction_service.category_monthly_trend(db, months=1, anchor=date(2026, 7, 1), top_n=2)

    names = [s["name"] for s in trend["series"]]
    assert names == ["식비", "주거비", "기타"]
    other_series = trend["series"][-1]
    assert other_series["category_id"] is None
    assert other_series["amounts"] == [Decimal("100000")]
