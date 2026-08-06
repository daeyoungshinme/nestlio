"""이미 입력된 CashflowPlanItem 중 category_id가 비어 있는 항목을, 이름이
scripts/seed_data.py의 DEFAULT_CASHFLOW_PLAN_ITEMS 매핑과 정확히 일치하면 해당 카테고리로 연결한다.

일회성 데이터 정리용 — 거래 카테고리(Category)와 목표 화면의 계획 항목(CashflowPlanItem) 이름
체계가 달라 예산 대비 실적/초과지출 코칭이 작동하지 않던 기존 데이터를 소급 적용한다.

Run with: .venv/Scripts/python.exe scripts/backfill_plan_categories.py
Safe to re-run: category_id가 이미 채워진 행은 건드리지 않는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.category import Category
from app.models.cashflow_plan_item import CashflowPlanItem
from scripts.seed_data import DEFAULT_CASHFLOW_PLAN_ITEMS

# (section, name) -> category_name, 매핑이 있는 항목만 추출 (scripts/seed_data.py와 동일 기준)
NAME_TO_CATEGORY = {
    (section, name): category_name
    for section, name, category_name in DEFAULT_CASHFLOW_PLAN_ITEMS
    if category_name
}


def backfill(db):
    category_id_by_name = {c.name: c.id for c in db.query(Category).all()}
    rows = db.query(CashflowPlanItem).filter(CashflowPlanItem.own_category_id.is_(None)).all()
    updated = 0
    for row in rows:
        category_name = NAME_TO_CATEGORY.get((row.section, row.name))
        if not category_name:
            continue
        category_id = category_id_by_name.get(category_name)
        if not category_id:
            continue
        row.own_category_id = category_id
        updated += 1
        print(f"linked [{row.year_month}] {row.section}/{row.name} -> {category_name}")
    db.commit()
    print(f"done: {updated} item(s) linked")


def main():
    db = SessionLocal()
    try:
        backfill(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
