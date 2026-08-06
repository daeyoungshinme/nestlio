from datetime import date
from decimal import Decimal

import pytest

from app.models.category import Category
from app.models.savings_product import SavingsProduct
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


def _add_savings_category_and_product(db):
    category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    product = SavingsProduct(name="적금", current_balance=Decimal("100000"), monthly_saving_amount=Decimal("0"))
    db.add_all([category, product])
    db.commit()
    db.refresh(category)
    db.refresh(product)
    return category, product


def test_create_transaction_with_savings_product_link_increments_balance(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)

    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("50000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    db.refresh(product)
    assert product.current_balance == Decimal("150000")


def test_create_transaction_savings_link_rejects_non_savings_category(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _, product = _add_savings_category_and_product(db)

    with pytest.raises(ValueError):
        transaction_service.create_transaction(
            db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1), savings_product_id=product.id
        )


def test_create_transaction_savings_link_rejects_income_type(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)

    with pytest.raises(ValueError):
        transaction_service.create_transaction(
            db,
            user.id,
            savings_category.id,
            "income",
            Decimal("10000"),
            date(2026, 7, 1),
            savings_product_id=product.id,
        )


def test_update_transaction_savings_link_amount_change_adjusts_balance(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)
    tx = transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("50000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    transaction_service.update_transaction(
        db,
        tx.id,
        amount=Decimal("80000"),
        type="expense",
        category_id=savings_category.id,
        transaction_date=date(2026, 7, 1),
        description=None,
        payment_method=None,
        account_id=None,
        savings_product_id=product.id,
    )

    db.refresh(product)
    assert product.current_balance == Decimal("180000")


def test_update_transaction_removing_savings_link_reverts_balance(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)
    tx = transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("50000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    transaction_service.update_transaction(
        db,
        tx.id,
        amount=Decimal("50000"),
        type="expense",
        category_id=savings_category.id,
        transaction_date=date(2026, 7, 1),
        description=None,
        payment_method=None,
        account_id=None,
        savings_product_id=None,
    )

    db.refresh(product)
    assert product.current_balance == Decimal("100000")


def test_delete_transaction_with_savings_link_reverts_balance(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)
    tx = transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("50000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    transaction_service.delete_transaction(db, tx.id)

    db.refresh(product)
    assert product.current_balance == Decimal("100000")


def test_period_totals_excludes_savings_linked_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    savings_category, product = _add_savings_category_and_product(db)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("50000"), date(2026, 7, 10))
    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("300000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    totals = transaction_service.period_totals(db, date(2026, 7, 1), date(2026, 7, 31))

    assert totals["expense"] == Decimal("50000")
    assert totals["fixed"] == Decimal("0")


def test_category_breakdown_excludes_savings_linked_transactions(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _add_savings_category_and_product(db)
    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("300000"),
        date(2026, 7, 1),
        savings_product_id=product.id,
    )

    breakdown = transaction_service.category_breakdown(db, date(2026, 7, 1), date(2026, 7, 31), "expense")

    assert breakdown == []


def test_frequent_unique_transactions_dedupes_same_combo_keeping_latest(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("4500"), date(2026, 7, 1), description="커피"
    )
    latest = transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("4500"), date(2026, 7, 10), description="커피"
    )

    recent = transaction_service.frequent_unique_transactions(db, "expense", today=date(2026, 7, 15))

    assert len(recent) == 1
    assert recent[0].id == latest.id


def test_frequent_unique_transactions_filters_by_type_and_is_savings(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    savings_category, product = _add_savings_category_and_product(db)
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("10000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "income", Decimal("3000000"), date(2026, 7, 2))
    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("300000"),
        date(2026, 7, 3),
        savings_product_id=product.id,
    )

    today = date(2026, 7, 15)
    expense_only = transaction_service.frequent_unique_transactions(db, "expense", today, is_savings=False)
    savings_only = transaction_service.frequent_unique_transactions(db, "expense", today, is_savings=True)
    income_only = transaction_service.frequent_unique_transactions(db, "income", today)

    assert [tx.category_id for tx in expense_only] == [food.id]
    assert [tx.category_id for tx in savings_only] == [savings_category.id]
    assert [tx.category_id for tx in income_only] == [food.id]


def test_frequent_unique_transactions_respects_limit_and_recency_tiebreak(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    for day, amount in enumerate([1000, 2000, 3000], start=1):
        transaction_service.create_transaction(
            db, user.id, food.id, "expense", Decimal(amount), date(2026, 7, day), description=f"item-{amount}"
        )

    recent = transaction_service.frequent_unique_transactions(db, "expense", today=date(2026, 7, 15), limit=2)

    assert len(recent) == 2
    assert recent[0].amount == Decimal("3000")
    assert recent[1].amount == Decimal("2000")


def test_frequent_unique_transactions_ranks_by_registration_count_over_recency(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    for day in (1, 5, 10):
        transaction_service.create_transaction(
            db, user.id, food.id, "expense", Decimal("4500"), date(2026, 7, day), description="커피"
        )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("9000"), date(2026, 7, 12), description="장보기"
    )

    ranked = transaction_service.frequent_unique_transactions(db, "expense", today=date(2026, 7, 15))

    assert [tx.description for tx in ranked] == ["커피", "장보기"]


def test_frequent_unique_transactions_ignores_entries_outside_since_days_window(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("4500"), date(2026, 1, 1), description="옛날 커피"
    )

    ranked = transaction_service.frequent_unique_transactions(
        db, "expense", today=date(2026, 7, 15), since_days=90
    )

    assert ranked == []
