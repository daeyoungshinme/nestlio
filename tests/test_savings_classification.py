"""저축 분류는 카테고리 기준 — 상품 연결 없이 저축 카테고리로 들어온 지출도 지출이 아니라 저축이다.
반복거래에 저축상품을 연결하면 자동 생성 거래가 상품 잔액을 올린다."""

from datetime import date
from decimal import Decimal

import pytest

from app.models.category import Category
from app.models.savings_product import SavingsProduct
from app.services import recurring_service, transaction_report_service, transaction_service
from app.services.transaction_service import InvalidSavingsLinkError


def _savings_category_and_product(db):
    category = Category(name="저축/투자", type="fixed", color="#10b981", is_savings=True, sort_order=0)
    product = SavingsProduct(
        name="적금", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"), product_type="savings"
    )
    db.add_all([category, product])
    db.commit()
    return category, product


def _tx(db, user, category, amount, type_="expense", savings_product_id=None, day=10):
    return transaction_service.create_transaction(
        db,
        user_id=user.id,
        category_id=category.id,
        type_=type_,
        amount=Decimal(amount),
        transaction_date=date(2026, 7, day),
        savings_product_id=savings_product_id,
        owner_user_id=user.id,
    )


def test_savings_category_without_product_is_not_expense(seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]
    savings_category, product = _savings_category_and_product(db)
    _tx(db, user, salary, "3000000", type_="income")
    _tx(db, user, food, "50000")
    _tx(db, user, savings_category, "500000")  # 상품 없음(CSV 가져오기·예전 반복거래)
    _tx(db, user, savings_category, "200000", savings_product_id=product.id)

    totals = transaction_report_service.period_totals(db, date(2026, 7, 1), date(2026, 7, 31))
    assert totals["expense"] == Decimal("50000")
    assert totals["savings"] == Decimal("2950000")

    breakdown = transaction_report_service.category_breakdown(db, date(2026, 7, 1), date(2026, 7, 31))
    assert [row["category_id"] for row in breakdown] == [food.id]

    mine = next(o for o in transaction_report_service.totals_by_owner(db, date(2026, 7, 1), date(2026, 7, 31))
                if o["owner_user_id"] == user.id)
    assert mine["expense"] == Decimal("50000")
    assert mine["savings_investment"] == Decimal("700000")


def test_recurring_with_savings_product_raises_balance(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _savings_category_and_product(db)
    recurring_service.create_recurring(
        db, name="적금", category_id=savings_category.id, amount=Decimal("500000"), frequency="monthly",
        start_date=date(2026, 7, 5), created_by=user.id, savings_product_id=product.id,
    )

    created = recurring_service.generate_due_transactions(db, today=date(2026, 7, 5))

    assert [tx.savings_product_id for tx in created] == [product.id]
    db.refresh(product)
    assert product.current_balance == Decimal("500000")


def test_recurring_savings_product_requires_savings_category(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _, product = _savings_category_and_product(db)
    with pytest.raises(InvalidSavingsLinkError):
        recurring_service.create_recurring(
            db, name="식비", category_id=food.id, amount=Decimal("1000"), frequency="monthly",
            start_date=date(2026, 7, 5), created_by=user.id, savings_product_id=product.id,
        )


def test_recurring_rejects_inactive_or_missing_product(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _savings_category_and_product(db)
    product.is_active = False
    db.commit()
    for product_id in (product.id, 999999):
        with pytest.raises(recurring_service.RecurringSavingsProductError):
            recurring_service.create_recurring(
                db, name="적금", category_id=savings_category.id, amount=Decimal("1000"), frequency="monthly",
                start_date=date(2026, 7, 5), created_by=user.id, savings_product_id=product_id,
            )


def test_update_recurring_links_and_unlinks_product(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category, product = _savings_category_and_product(db)
    recurring = recurring_service.create_recurring(
        db, name="적금", category_id=savings_category.id, amount=Decimal("500000"), frequency="monthly",
        start_date=date(2026, 7, 5), created_by=user.id,
    )
    assert recurring_service.update_recurring(db, recurring.id, savings_product_id=product.id).savings_product_id == product.id
    assert recurring_service.update_recurring(db, recurring.id, savings_product_id=None).savings_product_id is None


def test_update_recurring_category_change_keeps_link_valid(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    savings_category, product = _savings_category_and_product(db)
    recurring = recurring_service.create_recurring(
        db, name="적금", category_id=savings_category.id, amount=Decimal("500000"), frequency="monthly",
        start_date=date(2026, 7, 5), created_by=user.id, savings_product_id=product.id,
    )
    with pytest.raises(InvalidSavingsLinkError):
        recurring_service.update_recurring(db, recurring.id, category_id=food.id)
