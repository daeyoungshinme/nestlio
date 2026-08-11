from datetime import date
from decimal import Decimal

from app.services import account_service, goal_service, loan_service, savings_product_service


def test_create_goal_uses_manual_current_amount_when_unlinked(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db, 1, "내집마련", 40, Decimal("100000000"), Decimal("500000"), Decimal("1000000")
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("1000000")
    assert goal_service.funding_source_breakdown(db, goal) == []


def test_linked_goal_current_amount_follows_product_balance(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "내집마련",
        40,
        Decimal("100000000"),
        Decimal("500000"),
        current_amount=Decimal("999"),  # 연동 상태에서는 무시되고 상품 잔액이 쓰인다
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("3000000")
    assert [fs["name"] for fs in goal_service.funding_source_breakdown(db, goal)] == ["청약통장"]

    savings_product_service.adjust_balance(db, product.id, Decimal("500000"))
    db.refresh(goal)
    assert goal_service.compute_current_amount(db, goal) == Decimal("3500000")


def test_goal_linked_to_multiple_products_sums_their_balances(seeded_db):
    db = seeded_db["db"]
    product_a = savings_product_service.create_product(db, "남편 적금", Decimal("2000000"), Decimal("100000"))
    product_b = savings_product_service.create_product(db, "아내 적금", Decimal("1500000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[
            {"type": "savings_product", "id": product_a.id},
            {"type": "savings_product", "id": product_b.id},
        ],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("3500000")
    breakdown = goal_service.funding_source_breakdown(db, goal)
    assert {fs["id"] for fs in breakdown} == {product_a.id, product_b.id}
    assert {fs["name"] for fs in breakdown} == {"남편 적금", "아내 적금"}


def test_unlinking_goal_falls_back_to_manual_amount(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("2000000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("2000000")

    updated = goal_service.update_goal(
        db,
        goal.id,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        current_amount=Decimal("1500000"),
        funding_sources=[],
    )
    assert goal_service.compute_current_amount(db, updated) == Decimal("1500000")
    assert goal_service.funding_source_breakdown(db, updated) == []


def test_linked_account_balance_is_added(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "생활비 통장", "bank", Decimal("1000000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "account", "id": account.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("1000000")


def test_linked_loan_balance_is_subtracted(seeded_db):
    db = seeded_db["db"]
    savings = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    loan = loan_service.create_loan(
        db, "전세대출", Decimal("1000000"), Decimal("50000"), None, None, None, None
    )
    goal = goal_service.create_goal(
        db,
        1,
        "내집마련",
        40,
        Decimal("100000000"),
        Decimal("500000"),
        funding_sources=[
            {"type": "savings_product", "id": savings.id},
            {"type": "loan", "id": loan.id},
        ],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("2000000")
    breakdown = {fs["type"]: fs["amount"] for fs in goal_service.funding_source_breakdown(db, goal)}
    assert breakdown["loan"] == Decimal("-1000000")


def test_mixed_funding_sources_match_net_worth_scope(seeded_db):
    """계좌+저축상품 전체와 대출 전체를 연동하면 net_worth_service.compute_current와 같은 값이 나와야 한다."""
    from app.services import net_worth_service

    db = seeded_db["db"]
    account = account_service.create_account(db, "생활비 통장", "bank", Decimal("1000000"))
    savings = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    loan = loan_service.create_loan(db, "전세대출", Decimal("500000"), Decimal("50000"), None, None, None, None)

    goal = goal_service.create_goal(
        db,
        1,
        "순자산 목표",
        None,
        Decimal("100000000"),
        Decimal("0"),
        funding_sources=[
            {"type": "account", "id": account.id},
            {"type": "savings_product", "id": savings.id},
            {"type": "loan", "id": loan.id},
        ],
    )

    net_worth = net_worth_service.compute_current(db)
    assert goal_service.compute_current_amount(db, goal) == net_worth["net_worth"]


def test_compute_months_remaining_none_without_target_date():
    assert goal_service.compute_months_remaining(date(2026, 1, 1), None) is None


def test_compute_months_remaining_counts_whole_months():
    assert goal_service.compute_months_remaining(date(2026, 1, 15), date(2027, 7, 1)) == 18


def test_compute_months_remaining_clamps_to_zero_when_target_date_passed():
    assert goal_service.compute_months_remaining(date(2026, 6, 1), date(2026, 1, 1)) == 0


def test_compute_suggested_monthly_amount_none_when_no_months_remaining():
    assert goal_service.compute_suggested_monthly_amount(Decimal("0"), Decimal("1000000"), None) is None
    assert goal_service.compute_suggested_monthly_amount(Decimal("0"), Decimal("1000000"), 0) is None


def test_compute_suggested_monthly_amount_divides_remaining_by_months():
    result = goal_service.compute_suggested_monthly_amount(Decimal("200000"), Decimal("2000000"), 6)
    assert result == Decimal("300000")


def test_compute_suggested_monthly_amount_clamps_to_zero_when_already_met():
    result = goal_service.compute_suggested_monthly_amount(Decimal("3000000"), Decimal("2000000"), 6)
    assert result == Decimal("0")


def test_to_out_includes_derived_fields_when_target_date_set(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("1200000"),
        Decimal("0"),
        current_amount=Decimal("0"),
        target_date=date(2026, 7, 1),
    )
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["target_date"] == date(2026, 7, 1)
    assert out["months_remaining"] == 6
    assert out["suggested_monthly_amount"] == Decimal("200000")


def test_to_out_derived_fields_are_none_without_target_date(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "여행자금", None, Decimal("1200000"), Decimal("0"))
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["target_date"] is None
    assert out["months_remaining"] is None
    assert out["suggested_monthly_amount"] is None
