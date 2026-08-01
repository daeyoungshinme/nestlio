from datetime import date
from decimal import Decimal

from app.models.transaction import Transaction
from app.services import recurring_service
from app.utils.dates import advance_due_date


def test_advance_due_date_monthly_clamps_and_self_corrects():
    # Jan 31 -> Feb has only 28 days in 2026 (not a leap year) -> clamps to 28
    assert advance_due_date(date(2026, 1, 31), "monthly", 31) == date(2026, 2, 28)
    # From the clamped Feb 28, the *next* month (March, 31 days) should recover day 31,
    # because day_of_month (31) is tracked independently rather than drifting off d.day.
    assert advance_due_date(date(2026, 2, 28), "monthly", 31) == date(2026, 3, 31)


def test_advance_due_date_yearly_handles_leap_day():
    # 2028 is a leap year, 2029 is not -> Feb 29 clamps to Feb 28
    assert advance_due_date(date(2028, 2, 29), "yearly", 29) == date(2029, 2, 28)


def test_advance_due_date_weekly():
    assert advance_due_date(date(2026, 7, 1), "weekly", None) == date(2026, 7, 8)


def test_update_recurring_changes_fields_and_returns_none_for_missing(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )

    updated = recurring_service.update_recurring(db, recurring.id, name="월세(인상)", amount=Decimal("850000"))

    assert updated.name == "월세(인상)"
    assert updated.amount == Decimal("850000")
    assert recurring_service.update_recurring(db, -1, name="없음") is None


def test_due_in_range_includes_only_active_items_within_window(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    in_range = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    out_of_range = recurring_service.create_recurring(
        db, name="보험료", category_id=rent.id, amount=Decimal("50000"),
        frequency="monthly", start_date=date(2026, 8, 1), created_by=user.id,
    )
    inactive = recurring_service.create_recurring(
        db, name="넷플릭스", category_id=rent.id, amount=Decimal("17000"),
        frequency="monthly", start_date=date(2026, 7, 10), created_by=user.id,
    )
    recurring_service.deactivate_recurring(db, inactive.id)

    due = recurring_service.due_in_range(db, date(2026, 7, 1), date(2026, 7, 31))

    assert [r.id for r in due] == [in_range.id]
    assert out_of_range.id not in [r.id for r in due]


def test_generate_due_transactions_creates_one_and_rolls_forward(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring = recurring_service.create_recurring(
        db,
        name="월세",
        category_id=rent.id,
        amount=Decimal("800000"),
        frequency="monthly",
        start_date=date(2026, 7, 1),
        created_by=user.id,
    )

    created = recurring_service.generate_due_transactions(db, today=date(2026, 7, 1))

    assert len(created) == 1
    assert created[0].amount == Decimal("800000")
    assert created[0].recurring_expense_id == recurring.id
    db.refresh(recurring)
    assert recurring.next_due_date == date(2026, 8, 1)


def test_generate_due_transactions_is_idempotent_on_rerun(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring_service.create_recurring(
        db,
        name="월세",
        category_id=rent.id,
        amount=Decimal("800000"),
        frequency="monthly",
        start_date=date(2026, 7, 1),
        created_by=user.id,
    )

    recurring_service.generate_due_transactions(db, today=date(2026, 7, 1))
    recurring_service.generate_due_transactions(db, today=date(2026, 7, 1))  # rerun same day

    count = db.query(Transaction).filter(Transaction.description == "월세").count()
    assert count == 1


def test_generate_due_transactions_catches_up_multiple_missed_periods(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring_service.create_recurring(
        db,
        name="월세",
        category_id=rent.id,
        amount=Decimal("800000"),
        frequency="monthly",
        start_date=date(2026, 5, 1),
        created_by=user.id,
    )

    # app was "off" for a while; first check happens on Jul 1, three periods overdue (May, Jun, Jul)
    created = recurring_service.generate_due_transactions(db, today=date(2026, 7, 1))

    assert len(created) == 3
    assert [tx.transaction_date for tx in created] == [date(2026, 5, 1), date(2026, 6, 1), date(2026, 7, 1)]
