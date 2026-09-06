from sqlalchemy.orm import Session

from app.models.category import Category


def list_categories(db: Session, active_only: bool = True, kind: str | None = None) -> list[Category]:
    query = db.query(Category)
    if active_only:
        query = query.filter(Category.is_active.is_(True))
    if kind is not None:
        query = query.filter(Category.kind == kind)
    return query.order_by(Category.type, Category.sort_order, Category.name).all()


def create_category(
    db: Session, name: str, type_: str, color: str, kind: str = "expense", benchmark_group: str | None = None
) -> Category:
    category = Category(name=name, kind=kind, type=type_, color=color, sort_order=999, benchmark_group=benchmark_group)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(
    db: Session,
    category_id: int,
    name: str,
    type_: str,
    color: str,
    kind: str | None = None,
    benchmark_group: str | None = None,
) -> Category | None:
    category = db.get(Category, category_id)
    if category is None:
        return None
    category.name = name
    category.type = type_
    category.color = color
    if kind is not None:
        category.kind = kind
    category.benchmark_group = benchmark_group
    db.commit()
    db.refresh(category)
    return category


def deactivate_category(db: Session, category_id: int) -> bool:
    """대상이 있으면 비활성화하고 True, 없으면 False (라우터가 404로 변환)."""
    category = db.get(Category, category_id)
    if category is None:
        return False
    category.is_active = False
    db.commit()
    return True
