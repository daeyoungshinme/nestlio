"""Seed default categories.

Run with: .venv/Scripts/python.exe scripts/seed_data.py
Safe to re-run: skips categories that already exist.

Users are no longer seeded here — spouse1/spouse2 already exist as Supabase Auth
accounts (shared with growlio) and their local `household.users` row is created
automatically on the first authenticated API request (see app/dependencies.py::get_current_user).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine
from app.models.cashflow_plan_item import CashflowPlanItem
from app.models.category import Category
from app.models.savings_product import SavingsProduct

DEFAULT_CATEGORIES = [
    ("주거비", "expense", "fixed", "#6366f1", False, False),
    ("보험료", "expense", "fixed", "#8b5cf6", False, False),
    ("구독료", "expense", "fixed", "#a855f7", False, False),
    ("대출상환", "expense", "fixed", "#7c3aed", False, True),
    ("식비", "expense", "variable", "#14b8a6", False, False),
    ("장보기", "expense", "variable", "#0d9488", False, False),
    ("쇼핑", "expense", "variable", "#f97316", True, False),
    ("여가", "expense", "variable", "#f59e0b", True, False),
    ("교통", "expense", "variable", "#0ea5e9", False, False),
    ("의료", "expense", "variable", "#ef4444", False, False),
    ("경조사비", "expense", "irregular", "#e11d48", False, False),
    ("명절비", "expense", "irregular", "#f43f5e", False, False),
    ("자동차세/보험료", "expense", "irregular", "#fb7185", False, False),
    ("월급", "income", "fixed", "#22c55e", False, False),
    ("부수입", "income", "variable", "#84cc16", False, False),
]

# (section, name) - owner_user_id는 사용자가 화면에서 본인/배우자를 지정한다
DEFAULT_CASHFLOW_PLAN_ITEMS = [
    ("income", "근로/사업소득"),
    ("income", "연금소득"),
    ("income", "정부연금"),
    ("income", "금융투자소득"),
    ("income", "부동산임대소득"),
    ("income", "기타소득"),
    ("fixed", "보장성보험"),
    ("fixed", "부채상환액"),
    ("fixed", "할부금"),
    ("fixed", "지원금"),
    ("fixed", "기타"),
    ("variable", "식료품비"),
    ("variable", "외식비"),
    ("variable", "관리비"),
    ("variable", "교통비"),
    ("variable", "통신비"),
    ("variable", "교육비"),
    ("variable", "여가 및 문화생활비"),
    ("variable", "용돈"),
    ("variable", "기타"),
    ("irregular", "휴가비"),
    ("irregular", "명절비"),
    ("irregular", "경조사비"),
    ("irregular", "피복비"),
    ("irregular", "재산세"),
    ("irregular", "자동차보험료"),
    ("irregular", "자동차세"),
]

DEFAULT_SAVINGS_PRODUCTS = [
    "비상예비자금으로 별도 관리하는 금액",
    "주택청약저축",
    "청약을 제외한 예금, 적금 등 총 저축 금액",
    "펀드, 주식 등 총 투자금액",
]


def seed_categories(db):
    for order, (name, kind, type_, color, is_discretionary, is_debt) in enumerate(DEFAULT_CATEGORIES):
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
            sort_order=order,
        ))
        print(f"created category: {name}")
    db.commit()


def seed_cashflow_plan_items(db):
    for order, (section, name) in enumerate(DEFAULT_CASHFLOW_PLAN_ITEMS):
        existing = db.query(CashflowPlanItem).filter(
            CashflowPlanItem.section == section, CashflowPlanItem.name == name
        ).first()
        if existing:
            continue
        db.add(CashflowPlanItem(section=section, name=name, amount=0, sort_order=order))
        print(f"created cashflow plan item: [{section}] {name}")
    db.commit()


def seed_savings_products(db):
    for order, name in enumerate(DEFAULT_SAVINGS_PRODUCTS):
        existing = db.query(SavingsProduct).filter(SavingsProduct.name == name).first()
        if existing:
            continue
        db.add(SavingsProduct(name=name, current_balance=0, monthly_saving_amount=0, sort_order=order))
        print(f"created savings product: {name}")
    db.commit()


def main():
    Base.metadata.create_all(bind=engine)  # no-op if alembic already applied
    db = SessionLocal()
    try:
        seed_categories(db)
        seed_cashflow_plan_items(db)
        seed_savings_products(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
