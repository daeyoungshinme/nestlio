from datetime import date
from decimal import Decimal

from app.models.category import Category
from app.services import retrospective_service, transaction_service


def test_build_covers_previous_month_across_year_boundary(seeded_db):
    """1월에 열면 작년 12월 회고 — 이번 달·전전달 거래는 섞이지 않는다."""
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("30000"), date(2025, 12, 10))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("800000"), date(2025, 12, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("99999"), date(2026, 1, 3))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("77777"), date(2025, 11, 30))

    r = retrospective_service.build(db, date(2026, 1, 5))

    assert (r["year_month"], r["start"], r["end"]) == ("2025-12", date(2025, 12, 1), date(2025, 12, 31))
    assert r["totals"]["expense"] == Decimal("830000")
    assert [row["amount"] for row in r["top_categories"]] == [Decimal("800000"), Decimal("30000")]


def test_build_limits_top_categories_to_three(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    for key, amount in (("food", "1000"), ("rent", "2000"), ("events", "3000")):
        transaction_service.create_transaction(db, user.id, seeded_db[key].id, "expense", Decimal(amount), date(2026, 9, 5))
    extra = Category(name="기타", type="variable", color="#999999", sort_order=99)
    db.add(extra)
    db.commit()
    transaction_service.create_transaction(db, user.id, extra.id, "expense", Decimal("500"), date(2026, 9, 6))

    r = retrospective_service.build(db, date(2026, 10, 6))

    assert len(r["breakdown"]) == 4
    assert [row["amount"] for row in r["top_categories"]] == [Decimal("3000"), Decimal("2000"), Decimal("1000")]
