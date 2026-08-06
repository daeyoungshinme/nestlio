"""Seed default categories.

Run with: .venv/Scripts/python.exe scripts/seed_data.py
Safe to re-run: skips categories that already exist.

Users are no longer seeded here — spouse1/spouse2 already exist as Supabase Auth
accounts (shared with growlio) and their local `household.users` row is created
automatically on the first authenticated API request (see app/dependencies.py::get_current_user).
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine
from app.models.cashflow_plan_item import CashflowPlanItem
from app.models.category import Category
from app.models.savings_product import SavingsProduct
from app.utils.dates import year_month_str

DEFAULT_CATEGORIES = [
    ("주거비", "expense", "fixed", "#6366f1", False, False, False),
    ("보험료", "expense", "fixed", "#8b5cf6", False, False, False),
    ("구독료", "expense", "fixed", "#a855f7", False, False, False),
    ("대출상환", "expense", "fixed", "#7c3aed", False, True, False),
    ("저축/투자", "expense", "fixed", "#10b981", False, False, True),
    ("식비", "expense", "variable", "#14b8a6", False, False, False),
    ("장보기", "expense", "variable", "#0d9488", False, False, False),
    ("쇼핑", "expense", "variable", "#f97316", True, False, False),
    ("여가", "expense", "variable", "#f59e0b", True, False, False),
    ("교통", "expense", "variable", "#0ea5e9", False, False, False),
    ("의료", "expense", "variable", "#ef4444", False, False, False),
    ("경조사비", "expense", "irregular", "#e11d48", False, False, False),
    ("명절비", "expense", "irregular", "#f43f5e", False, False, False),
    ("자동차세/보험료", "expense", "irregular", "#fb7185", False, False, False),
    ("월급", "income", "fixed", "#22c55e", False, False, False),
    ("부수입", "income", "variable", "#84cc16", False, False, False),
]

# (section, name, category_name) - owner_user_id는 사용자가 화면에서 본인/배우자를 지정한다.
# category_name이 채워진 항목은 DEFAULT_CATEGORIES의 동명(또는 대응) 카테고리에 자동으로 태깅되어,
# 처음부터 budget_service.budget_vs_actual(예산 대비 실적)과 대시보드 초과지출 코칭에 반영된다.
# 대응되는 카테고리가 없거나 의미가 애매한 항목(관리비/통신비/교육비/용돈/할부금/지원금/휴가비/피복비/
# 재산세/각 섹션의 "기타")은 억지로 매핑하지 않고 자유 텍스트로 남겨둔다.
DEFAULT_CASHFLOW_PLAN_ITEMS = [
    ("income", "근로/사업소득", None),
    ("income", "연금소득", None),
    ("income", "정부연금", None),
    ("income", "금융투자소득", None),
    ("income", "부동산임대소득", None),
    ("income", "기타소득", None),
    ("fixed", "보장성보험", "보험료"),
    ("fixed", "부채상환액", "대출상환"),
    ("fixed", "할부금", None),
    ("fixed", "지원금", None),
    ("fixed", "기타", None),
    ("variable", "식료품비", "장보기"),
    ("variable", "외식비", "식비"),
    ("variable", "관리비", None),
    ("variable", "교통비", "교통"),
    ("variable", "통신비", None),
    ("variable", "교육비", None),
    ("variable", "여가 및 문화생활비", "여가"),
    ("variable", "용돈", None),
    ("variable", "기타", None),
    ("irregular", "휴가비", None),
    ("irregular", "명절비", "명절비"),
    ("irregular", "경조사비", "경조사비"),
    ("irregular", "피복비", None),
    ("irregular", "재산세", None),
    ("irregular", "자동차보험료", "자동차세/보험료"),
    ("irregular", "자동차세", "자동차세/보험료"),
]

DEFAULT_SAVINGS_PRODUCTS = [
    ("비상예비자금으로 별도 관리하는 금액", "savings"),
    ("주택청약저축", "savings"),
    ("청약을 제외한 예금, 적금 등 총 저축 금액", "savings"),
    ("펀드, 주식 등 총 투자금액", "investment"),
]


def seed_categories(db):
    for order, (name, kind, type_, color, is_discretionary, is_debt, is_savings) in enumerate(DEFAULT_CATEGORIES):
        existing = db.query(Category).filter(Category.name == name).first()
        if existing:
            continue
        db.add(Category(
            name=name,
            kind=kind,
            type=type_,
            color=color,
            is_discretionary=is_discretionary,
            is_debt=is_debt,
            is_savings=is_savings,
            sort_order=order,
        ))
        print(f"created category: {name}")
    db.commit()


def seed_cashflow_plan_items(db, year_month: str):
    for order, (section, name, category_name) in enumerate(DEFAULT_CASHFLOW_PLAN_ITEMS):
        existing = db.query(CashflowPlanItem).filter(
            CashflowPlanItem.section == section,
            CashflowPlanItem.name == name,
            CashflowPlanItem.year_month == year_month,
        ).first()
        if existing:
            continue
        category_id = None
        if category_name:
            category = db.query(Category).filter(Category.name == category_name).first()
            category_id = category.id if category else None
        db.add(CashflowPlanItem(
            section=section,
            name=name,
            own_amount=0,
            own_category_id=category_id,
            sort_order=order,
            year_month=year_month,
        ))
        print(f"created cashflow plan item: [{section}] {name}")
    db.commit()


def seed_savings_products(db):
    for order, (name, product_type) in enumerate(DEFAULT_SAVINGS_PRODUCTS):
        existing = db.query(SavingsProduct).filter(SavingsProduct.name == name).first()
        if existing:
            continue
        db.add(SavingsProduct(
            name=name,
            current_balance=0,
            monthly_saving_amount=0,
            product_type=product_type,
            sort_order=order,
        ))
        print(f"created savings product: {name}")
    db.commit()


def main():
    Base.metadata.create_all(bind=engine)  # no-op if alembic already applied
    db = SessionLocal()
    try:
        seed_categories(db)
        seed_cashflow_plan_items(db, year_month_str(date.today()))
        seed_savings_products(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
