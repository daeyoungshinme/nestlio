from datetime import date
from decimal import Decimal

from app.models.category import Category
from app.services import dashboard_service, transaction_service


def test_build_month_combines_totals_and_streak(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    today = date(2026, 8, 15)
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="income", amount=Decimal("2000000"), transaction_date=today)
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("500000"), transaction_date=today)

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


def test_retrospective_covers_previous_month_across_year_boundary(seeded_db):
    """1월에 열면 작년 12월 회고 — 이번 달·전전달 거래는 섞이지 않는다."""
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("30000"), transaction_date=date(2025, 12, 10))
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("800000"), transaction_date=date(2025, 12, 1))
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("99999"), transaction_date=date(2026, 1, 3))
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("77777"), transaction_date=date(2025, 11, 30))

    r = dashboard_service.build_retrospective(db, date(2026, 1, 5))

    assert (r["year_month"], r["start"], r["end"]) == ("2025-12", date(2025, 12, 1), date(2025, 12, 31))
    assert r["totals"]["expense"] == Decimal("830000")
    assert [row["amount"] for row in r["top_categories"]] == [Decimal("800000"), Decimal("30000")]


def test_retrospective_limits_top_categories_to_three(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    for key, amount in (("food", "1000"), ("rent", "2000"), ("events", "3000")):
        transaction_service.create_transaction(db, user_id=user.id, category_id=seeded_db[key].id, type_="expense", amount=Decimal(amount), transaction_date=date(2026, 9, 5))
    extra = Category(name="기타", type="variable", color="#999999", sort_order=99)
    db.add(extra)
    db.commit()
    transaction_service.create_transaction(db, user_id=user.id, category_id=extra.id, type_="expense", amount=Decimal("500"), transaction_date=date(2026, 9, 6))

    r = dashboard_service.build_retrospective(db, date(2026, 10, 6))

    assert len(r["breakdown"]) == 4
    assert [row["amount"] for row in r["top_categories"]] == [Decimal("3000"), Decimal("2000"), Decimal("1000")]
