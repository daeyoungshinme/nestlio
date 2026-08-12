"""goal_service, savings_product_service, loan_service는 각자 단순 CRUD만 하는 작은
서비스라 test_csv_and_accounts.py처럼 한 파일에 묶어 다룬다."""
from decimal import Decimal

from app.services import goal_service, loan_service, savings_product_service


def test_goal_create_update_delete(seeded_db):
    db = seeded_db["db"]

    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("500000000"), Decimal("1500000"))
    assert goal.id is not None

    updated = goal_service.update_goal(db, goal.id, 1, "내집마련", 42, Decimal("550000000"), Decimal("1600000"))
    assert updated.target_age == 42
    assert updated.required_amount == Decimal("550000000")

    goal_service.delete_goal(db, goal.id)
    assert goal_service.list_goals(db) == []


def test_goal_update_missing_returns_none(seeded_db):
    db = seeded_db["db"]

    result = goal_service.update_goal(db, 999, 1, "x", None, Decimal("0"), Decimal("0"))

    assert result is None


def test_goal_progress_pct(seeded_db):
    db = seeded_db["db"]

    def progress_pct(goal):
        return goal_service.compute_progress_pct(goal_service.compute_current_amount(db, goal), goal.required_amount)

    goal = goal_service.create_goal(
        db, 1, "내집마련", 40, Decimal("500000000"), Decimal("1500000"), Decimal("125000000")
    )
    assert progress_pct(goal) == Decimal("25")

    no_target = goal_service.create_goal(db, 2, "무제한목표", None, Decimal("0"), Decimal("0"), Decimal("100"))
    assert progress_pct(no_target) == Decimal("0")

    overfunded = goal_service.create_goal(
        db, 3, "초과달성", None, Decimal("1000000"), Decimal("0"), Decimal("2000000")
    )
    assert progress_pct(overfunded) == Decimal("100")


def test_savings_product_create_update_deactivate(seeded_db):
    db = seeded_db["db"]

    product = savings_product_service.create_product(db, "비상예비자금", Decimal("3000000"), Decimal("200000"))
    assert product.is_active is True

    savings_product_service.update_product(db, product.id, "비상예비자금", Decimal("3200000"), Decimal("200000"), "savings")
    savings_product_service.deactivate_product(db, product.id)

    active = savings_product_service.list_products(db, active_only=True)
    all_products = savings_product_service.list_products(db, active_only=False)
    assert active == []
    assert len(all_products) == 1
    assert all_products[0].current_balance == Decimal("3200000")


def test_loan_create_update_deactivate(seeded_db):
    db = seeded_db["db"]

    loan = loan_service.create_loan(
        db, "주택담보대출", Decimal("200000000"), Decimal("900000"), "2024-03", 360, Decimal("3.5"), "equal_payment"
    )
    assert loan.is_active is True

    updated = loan_service.update_loan(
        db, loan.id, "주택담보대출", Decimal("195000000"), Decimal("900000"), "2024-03", 360, Decimal("3.5"), "equal_payment"
    )
    assert updated.balance == Decimal("195000000")

    loan_service.deactivate_loan(db, loan.id)

    assert loan_service.list_loans(db, active_only=True) == []
    assert len(loan_service.list_loans(db, active_only=False)) == 1


def test_loan_create_and_update_owner_user_id(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    loan = loan_service.create_loan(
        db, "신용대출", Decimal("5000000"), Decimal("200000"), None, None, None, None, user.id
    )
    assert loan.owner_user_id == user.id

    updated = loan_service.update_loan(
        db, loan.id, "신용대출", Decimal("4800000"), Decimal("200000"), None, None, None, None, None
    )
    assert updated.owner_user_id is None
