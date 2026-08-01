import csv
import io
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.utils.dates import month_bounds, shift_month, year_bounds, year_month_str

CSV_HEADER = ["날짜", "구분", "카테고리", "금액", "메모", "입력자"]
CSV_TYPE_LABELS = {"income": "수입", "expense": "지출"}
CSV_TYPE_BY_LABEL = {"수입": "income", "지출": "expense", "income": "income", "expense": "expense"}


def create_transaction(
    db: Session,
    user_id: uuid.UUID,
    category_id: int,
    type_: str,
    amount: Decimal,
    transaction_date: date,
    description: str | None = None,
    payment_method: str | None = None,
    recurring_expense_id: int | None = None,
    account_id: int | None = None,
) -> Transaction:
    tx = Transaction(
        user_id=user_id,
        category_id=category_id,
        type=type_,
        amount=amount,
        transaction_date=transaction_date,
        description=description,
        payment_method=payment_method,
        recurring_expense_id=recurring_expense_id,
        account_id=account_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def get_transaction(db: Session, tx_id: int) -> Transaction | None:
    return db.get(Transaction, tx_id)


def update_transaction(db: Session, tx_id: int, **fields) -> Transaction | None:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return None
    for key, value in fields.items():
        setattr(tx, key, value)
    db.commit()
    db.refresh(tx)
    return tx


def delete_transaction(db: Session, tx_id: int) -> bool:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return False
    db.delete(tx)
    db.commit()
    return True


def list_transactions(
    db: Session,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type_: str | None = None,
    user_id: uuid.UUID | None = None,
) -> list[Transaction]:
    query = db.query(Transaction)
    if date_from is not None:
        query = query.filter(Transaction.transaction_date >= date_from)
    if date_to is not None:
        query = query.filter(Transaction.transaction_date <= date_to)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type_ is not None:
        query = query.filter(Transaction.type == type_)
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    return query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()


def period_totals(db: Session, date_from: date, date_to: date) -> dict:
    """Income / expense / fixed / variable / irregular totals for a date range."""
    rows = (
        db.query(Transaction.type, Category.type.label("cat_type"), func.sum(Transaction.amount))
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.transaction_date >= date_from, Transaction.transaction_date <= date_to)
        .group_by(Transaction.type, Category.type)
        .all()
    )
    totals = {
        "income": Decimal("0"),
        "expense": Decimal("0"),
        "fixed": Decimal("0"),
        "variable": Decimal("0"),
        "irregular": Decimal("0"),
    }
    for tx_type, cat_type, amount in rows:
        amount = amount or Decimal("0")
        totals[tx_type] = totals.get(tx_type, Decimal("0")) + amount
        if tx_type == "expense":
            totals[cat_type] = totals.get(cat_type, Decimal("0")) + amount
    totals["savings"] = totals["income"] - totals["expense"]
    return totals


def totals_by_user(db: Session, date_from: date, date_to: date) -> list[dict]:
    """Income/expense/savings totals per user for a date range, for spouse contribution comparison.
    Only includes users with at least one transaction in the range."""
    rows = (
        db.query(User.id, User.display_name, Transaction.type, func.sum(Transaction.amount))
        .join(Transaction, Transaction.user_id == User.id)
        .filter(Transaction.transaction_date >= date_from, Transaction.transaction_date <= date_to)
        .group_by(User.id, Transaction.type)
        .all()
    )
    by_user: dict[uuid.UUID, dict] = {}
    for user_id, display_name, tx_type, amount in rows:
        entry = by_user.setdefault(
            user_id,
            {"user_id": user_id, "display_name": display_name, "income": Decimal("0"), "expense": Decimal("0")},
        )
        entry[tx_type] = amount or Decimal("0")
    result = list(by_user.values())
    for entry in result:
        entry["savings"] = entry["income"] - entry["expense"]
    return sorted(result, key=lambda r: r["display_name"])


def category_breakdown(db: Session, date_from: date, date_to: date, type_: str = "expense") -> list[dict]:
    rows = (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            Category.type,
            Category.is_discretionary,
            Category.is_debt,
            func.sum(Transaction.amount),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
        )
        .group_by(Category.id)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    return [
        {
            "category_id": r[0],
            "name": r[1],
            "color": r[2],
            "type": r[3],
            "is_discretionary": r[4],
            "is_debt": r[5],
            "amount": r[6],
        }
        for r in rows
    ]


def monthly_trend(db: Session, months: int = 6, anchor: date | None = None) -> list[dict]:
    """Income/expense totals for the trailing `months` calendar months, oldest first."""
    anchor = anchor or date.today()
    results = []
    for offset in range(months - 1, -1, -1):
        month_start = shift_month(anchor, -offset)
        start, end = month_bounds(month_start)
        totals = period_totals(db, start, end)
        results.append(
            {
                "year_month": year_month_str(month_start),
                "income": totals["income"],
                "expense": totals["expense"],
                "fixed": totals["fixed"],
                "variable": totals["variable"],
                "irregular": totals["irregular"],
            }
        )
    return results


def trailing_average_by_category(db: Session, anchor: date, months: int = 3, type_: str = "expense") -> dict[int, Decimal]:
    """Average per-category spend over the `months` immediately before anchor's month (excludes anchor's month)."""
    totals: dict[int, Decimal] = {}
    for offset in range(1, months + 1):
        month_start = shift_month(anchor, -offset)
        start, end = month_bounds(month_start)
        for row in category_breakdown(db, start, end, type_):
            totals[row["category_id"]] = totals.get(row["category_id"], Decimal("0")) + row["amount"]
    return {cat_id: total / months for cat_id, total in totals.items()}


def category_monthly_trend(
    db: Session, months: int = 6, anchor: date | None = None, type_: str = "expense", top_n: int = 6
) -> dict:
    """Per-category spend for each of the trailing `months` calendar months, for a
    multi-line trend chart. Only the top `top_n` categories (by total spend across the
    window) get their own series; everything else is folded into a '기타' series."""
    anchor = anchor or date.today()
    month_keys: list[str] = []
    monthly_breakdowns: list[list[dict]] = []
    for offset in range(months - 1, -1, -1):
        month_start = shift_month(anchor, -offset)
        start, end = month_bounds(month_start)
        month_keys.append(year_month_str(month_start))
        monthly_breakdowns.append(category_breakdown(db, start, end, type_))

    totals_by_category: dict[int, dict] = {}
    for breakdown in monthly_breakdowns:
        for row in breakdown:
            entry = totals_by_category.setdefault(
                row["category_id"], {"name": row["name"], "color": row["color"], "total": Decimal("0")}
            )
            entry["total"] += row["amount"]

    top_ids = sorted(totals_by_category, key=lambda cid: totals_by_category[cid]["total"], reverse=True)[:top_n]
    top_id_set = set(top_ids)

    series = []
    for cat_id in top_ids:
        meta = totals_by_category[cat_id]
        amounts = []
        for breakdown in monthly_breakdowns:
            row = next((r for r in breakdown if r["category_id"] == cat_id), None)
            amounts.append(row["amount"] if row else Decimal("0"))
        series.append({"category_id": cat_id, "name": meta["name"], "color": meta["color"], "amounts": amounts})

    other_amounts = [
        sum((r["amount"] for r in breakdown if r["category_id"] not in top_id_set), Decimal("0"))
        for breakdown in monthly_breakdowns
    ]
    if any(other_amounts):
        series.append({"category_id": None, "name": "기타", "color": "#888888", "amounts": other_amounts})

    return {"months": month_keys, "series": series}


def yearly_monthly_breakdown(db: Session, year: int) -> list[dict]:
    """Jan-Dec totals for a specific calendar year (unlike monthly_trend, which is
    a trailing window ending at an anchor date)."""
    results = []
    for month in range(1, 13):
        start, end = month_bounds(date(year, month, 1))
        totals = period_totals(db, start, end)
        results.append(
            {
                "year_month": year_month_str(start),
                "income": totals["income"],
                "expense": totals["expense"],
                "fixed": totals["fixed"],
                "variable": totals["variable"],
                "irregular": totals["irregular"],
                "savings": totals["savings"],
            }
        )
    return results


def yearly_totals(db: Session, year: int) -> dict:
    start, end = year_bounds(year)
    return period_totals(db, start, end)


def export_csv(transactions: list[Transaction]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for tx in transactions:
        writer.writerow(
            [
                tx.transaction_date.isoformat(),
                CSV_TYPE_LABELS.get(tx.type, tx.type),
                tx.category.name,
                str(tx.amount),
                tx.description or "",
                tx.user.display_name,
            ]
        )
    return buffer.getvalue()


def import_csv(db: Session, content: str, user_id: uuid.UUID) -> dict:
    """Bulk-create transactions from a CSV matching export_csv's column layout.
    Unknown categories or malformed rows are skipped and reported, not raised,
    so one bad row doesn't abort an otherwise-good import."""
    categories_by_name = {c.name: c for c in db.query(Category).all()}
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if rows and rows[0] and rows[0][0].strip() in ("날짜", CSV_HEADER[0]):
        rows = rows[1:]  # skip header if present

    created = 0
    skipped: list[dict] = []
    for line_no, row in enumerate(rows, start=1):
        if not row or not any(cell.strip() for cell in row):
            continue
        try:
            raw_date, raw_type, raw_category, raw_amount, *rest = row
            description = rest[0] if rest else ""
            tx_type = CSV_TYPE_BY_LABEL.get(raw_type.strip())
            category = categories_by_name.get(raw_category.strip())
            if tx_type is None or category is None:
                raise ValueError("unknown type or category")
            create_transaction(
                db,
                user_id=user_id,
                category_id=category.id,
                type_=tx_type,
                amount=Decimal(raw_amount.strip()),
                transaction_date=date.fromisoformat(raw_date.strip()),
                description=description.strip() or None,
            )
            created += 1
        except (ValueError, InvalidOperation, IndexError) as exc:
            skipped.append({"line": line_no, "row": row, "reason": str(exc)})
    return {"created": created, "skipped": skipped}
