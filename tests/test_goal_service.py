from decimal import Decimal

from app.services import goal_service, savings_product_service


def test_create_goal_uses_manual_current_amount_when_unlinked(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db, 1, "내집마련", 40, Decimal("100000000"), Decimal("500000"), Decimal("1000000")
    )
    assert goal.current_amount == Decimal("1000000")
    assert goal.funding_source_ids == []


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
        savings_product_ids=[product.id],
    )
    assert goal.current_amount == Decimal("3000000")
    assert goal.funding_source_names == ["청약통장"]

    savings_product_service.adjust_balance(db, product.id, Decimal("500000"))
    db.refresh(goal)
    assert goal.current_amount == Decimal("3500000")


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
        savings_product_ids=[product_a.id, product_b.id],
    )
    assert goal.current_amount == Decimal("3500000")
    assert set(goal.funding_source_ids) == {product_a.id, product_b.id}
    assert set(goal.funding_source_names) == {"남편 적금", "아내 적금"}


def test_unlinking_goal_falls_back_to_manual_amount(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("2000000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db, 1, "여행자금", None, Decimal("5000000"), Decimal("200000"), savings_product_ids=[product.id]
    )
    assert goal.current_amount == Decimal("2000000")

    updated = goal_service.update_goal(
        db,
        goal.id,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        current_amount=Decimal("1500000"),
        savings_product_ids=[],
    )
    assert updated.current_amount == Decimal("1500000")
    assert updated.funding_source_names == []
