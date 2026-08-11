import csv
import io
import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.savings_product import SavingsProduct
from app.models.transaction import Transaction
from app.models.user import User
from app.services import growlio_client, savings_product_service
from app.utils.dates import month_bounds, shift_month, year_bounds, year_month_str

logger = logging.getLogger(__name__)

CSV_HEADER = ["날짜", "구분", "카테고리", "금액", "메모", "입력자"]
CSV_TYPE_LABELS = {"income": "수입", "expense": "지출"}
CSV_TYPE_BY_LABEL = {"수입": "income", "지출": "expense", "income": "income", "expense": "expense"}


def _validate_savings_link(db: Session, category_id: int, type_: str, savings_product_id: int | None) -> None:
    if savings_product_id is None:
        return
    if type_ != "expense":
        raise ValueError("저축상품은 지출 내역에만 연결할 수 있습니다.")
    category = db.get(Category, category_id)
    if category is None or not category.is_savings:
        raise ValueError("저축상품은 저축 전용 카테고리에서만 연결할 수 있습니다.")


def _push_growlio(
    db: Session,
    tx: Transaction,
    savings_product_id: int,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    bearer_token: str | None,
) -> None:
    """저축/투자 잔액 조정을 growlio 쪽에도 best-effort로 반영한다.

    growlio가 잠들어있거나 응답하지 않아도 가계부 저장 자체는 이미 끝난 뒤이므로 절대
    raise하지 않는다 — 실패 시 로그만 남기고 tx에 비영속 플래그(growlio_sync_failed)를 얹어
    라우터가 응답 헤더로 경고를 알릴 수 있게 한다(TransactionOut 스키마 변경 없이 소비).
    """
    if not bearer_token:
        return
    product = db.get(SavingsProduct, savings_product_id)
    if product is None or not product.growlio_account_id:
        return
    try:
        growlio_client.push_transaction(
            bearer_token, product.growlio_account_id, transaction_type, amount, transaction_date
        )
    except (growlio_client.GrowlioNotConfiguredError, growlio_client.GrowlioRequestError):
        logger.warning(
            "growlio_push_failed savings_product_id=%s type=%s amount=%s (거래는 정상 저장됨)",
            savings_product_id,
            transaction_type,
            amount,
            exc_info=True,
        )
        tx.growlio_sync_failed = True


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
    savings_product_id: int | None = None,
    bearer_token: str | None = None,
) -> Transaction:
    _validate_savings_link(db, category_id, type_, savings_product_id)
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
        savings_product_id=savings_product_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    if savings_product_id is not None:
        savings_product_service.adjust_balance(db, savings_product_id, amount)
        db.refresh(tx)
        _push_growlio(db, tx, savings_product_id, "DEPOSIT", amount, transaction_date, bearer_token)
    return tx


def get_transaction(db: Session, tx_id: int) -> Transaction | None:
    return db.get(Transaction, tx_id)


def update_transaction(db: Session, tx_id: int, bearer_token: str | None = None, **fields) -> Transaction | None:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return None
    new_type = fields.get("type", tx.type)
    new_category_id = fields.get("category_id", tx.category_id)
    new_savings_product_id = fields.get("savings_product_id", tx.savings_product_id)
    _validate_savings_link(db, new_category_id, new_type, new_savings_product_id)

    old_amount = tx.amount
    old_savings_product_id = tx.savings_product_id
    old_transaction_date = tx.transaction_date
    for key, value in fields.items():
        setattr(tx, key, value)
    db.commit()
    db.refresh(tx)

    if old_savings_product_id is not None:
        savings_product_service.adjust_balance(db, old_savings_product_id, -old_amount)
    if new_savings_product_id is not None:
        savings_product_service.adjust_balance(db, new_savings_product_id, tx.amount)
    if old_savings_product_id is not None or new_savings_product_id is not None:
        db.refresh(tx)

    if old_savings_product_id is not None:
        _push_growlio(db, tx, old_savings_product_id, "WITHDRAWAL", old_amount, old_transaction_date, bearer_token)
    if new_savings_product_id is not None:
        _push_growlio(db, tx, new_savings_product_id, "DEPOSIT", tx.amount, tx.transaction_date, bearer_token)
    return tx


def delete_transaction(db: Session, tx_id: int, bearer_token: str | None = None) -> bool:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return False
    if tx.savings_product_id is not None:
        savings_product_service.adjust_balance(db, tx.savings_product_id, -tx.amount)
        _push_growlio(db, tx, tx.savings_product_id, "WITHDRAWAL", tx.amount, tx.transaction_date, bearer_token)
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


def frequent_unique_transactions(
    db: Session,
    type_: str,
    today: date,
    is_savings: bool = False,
    limit: int = 8,
    since_days: int = 90,
    scan_limit: int = 300,
) -> list[Transaction]:
    """Transactions grouped by (category, description, amount, account, savings product) within
    the last `since_days` days, ranked by how many times that exact combo was registered (ties
    broken by most recent). Used to let the user one-tap re-register a frequently repeated entry."""
    cutoff = today - timedelta(days=since_days)
    rows = (
        db.query(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Category.is_savings.is_(is_savings),
            Transaction.transaction_date >= cutoff,
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .limit(scan_limit)
        .all()
    )
    groups: dict[tuple, dict] = {}
    for tx in rows:
        key = (tx.category_id, tx.description, tx.amount, tx.account_id, tx.savings_product_id)
        group = groups.setdefault(key, {"count": 0, "tx": tx})
        group["count"] += 1
    ranked = sorted(
        groups.values(),
        key=lambda g: (-g["count"], -g["tx"].transaction_date.toordinal(), -g["tx"].id),
    )
    return [g["tx"] for g in ranked[:limit]]


def period_totals(db: Session, date_from: date, date_to: date) -> dict:
    """Income / expense / fixed / variable / irregular totals for a date range."""
    rows = (
        db.query(Transaction.type, Category.type.label("cat_type"), func.sum(Transaction.amount))
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
            Transaction.savings_product_id.is_(None),
        )
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
        .filter(
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
            Transaction.savings_product_id.is_(None),
        )
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


def category_breakdown(
    db: Session, date_from: date, date_to: date, type_: str = "expense", user_id: uuid.UUID | None = None
) -> list[dict]:
    """user_id를 지정하면 해당 사용자의 거래만 집계한다 (배우자별 카테고리 지출 비교용)."""
    query = (
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
            Transaction.savings_product_id.is_(None),
        )
    )
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    rows = query.group_by(Category.id).order_by(func.sum(Transaction.amount).desc()).all()
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


def _monthly_totals_map(db: Session, month_starts: list[date]) -> dict[str, dict]:
    """period_totals(), batched into a single query, grouped by calendar month.
    `month_starts` must be the first-of-month dates to report on (need not be contiguous)."""
    result = {
        year_month_str(m): {
            "income": Decimal("0"),
            "expense": Decimal("0"),
            "fixed": Decimal("0"),
            "variable": Decimal("0"),
            "irregular": Decimal("0"),
        }
        for m in month_starts
    }
    if not month_starts:
        return result
    range_start = min(month_starts)
    range_end = month_bounds(max(month_starts))[1]
    rows = (
        db.query(Transaction.transaction_date, Transaction.type, Category.type, Transaction.amount)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.transaction_date >= range_start,
            Transaction.transaction_date <= range_end,
            Transaction.savings_product_id.is_(None),
        )
        .all()
    )
    for tx_date, tx_type, cat_type, amount in rows:
        totals = result.get(year_month_str(tx_date))
        if totals is None:  # month not requested (can't happen for contiguous callers, but keep it safe)
            continue
        amount = amount or Decimal("0")
        totals[tx_type] = totals.get(tx_type, Decimal("0")) + amount
        if tx_type == "expense":
            totals[cat_type] = totals.get(cat_type, Decimal("0")) + amount
    for totals in result.values():
        totals["savings"] = totals["income"] - totals["expense"]
    return result


def _category_breakdown_by_month(db: Session, month_starts: list[date], type_: str) -> dict[str, list[dict]]:
    """category_breakdown(), batched into a single query, grouped by calendar month."""
    by_month: dict[str, dict[int, dict]] = {year_month_str(m): {} for m in month_starts}
    if not month_starts:
        return by_month
    range_start = min(month_starts)
    range_end = month_bounds(max(month_starts))[1]
    rows = (
        db.query(
            Transaction.transaction_date,
            Category.id,
            Category.name,
            Category.color,
            Category.type,
            Category.is_discretionary,
            Category.is_debt,
            Transaction.amount,
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Transaction.transaction_date >= range_start,
            Transaction.transaction_date <= range_end,
            Transaction.savings_product_id.is_(None),
        )
        .all()
    )
    for tx_date, cat_id, name, color, cat_type, is_discretionary, is_debt, amount in rows:
        bucket = by_month.get(year_month_str(tx_date))
        if bucket is None:
            continue
        entry = bucket.setdefault(
            cat_id,
            {
                "category_id": cat_id,
                "name": name,
                "color": color,
                "type": cat_type,
                "is_discretionary": is_discretionary,
                "is_debt": is_debt,
                "amount": Decimal("0"),
            },
        )
        entry["amount"] += amount or Decimal("0")
    return {ym: sorted(bucket.values(), key=lambda r: r["amount"], reverse=True) for ym, bucket in by_month.items()}


def monthly_trend(db: Session, months: int = 6, anchor: date | None = None) -> list[dict]:
    """Income/expense totals for the trailing `months` calendar months, oldest first."""
    anchor = anchor or date.today()
    month_starts = [shift_month(anchor, -offset) for offset in range(months - 1, -1, -1)]
    totals_by_month = _monthly_totals_map(db, month_starts)
    return [
        {
            "year_month": ym,
            "income": totals_by_month[ym]["income"],
            "expense": totals_by_month[ym]["expense"],
            "fixed": totals_by_month[ym]["fixed"],
            "variable": totals_by_month[ym]["variable"],
            "irregular": totals_by_month[ym]["irregular"],
        }
        for ym in (year_month_str(m) for m in month_starts)
    ]


def trailing_average_by_category(db: Session, anchor: date, months: int = 3, type_: str = "expense") -> dict[int, Decimal]:
    """Average per-category spend over the `months` immediately before anchor's month (excludes anchor's month)."""
    month_starts = [shift_month(anchor, -offset) for offset in range(1, months + 1)]
    breakdown_by_month = _category_breakdown_by_month(db, month_starts, type_)
    totals: dict[int, Decimal] = {}
    for rows in breakdown_by_month.values():
        for row in rows:
            totals[row["category_id"]] = totals.get(row["category_id"], Decimal("0")) + row["amount"]
    return {cat_id: total / months for cat_id, total in totals.items()}


def trailing_average_savings(db: Session, anchor: date, months: int = 3) -> Decimal:
    """Average household net savings (income-expense) over the `months` immediately before
    anchor's month (excludes anchor's month)."""
    month_starts = [shift_month(anchor, -offset) for offset in range(1, months + 1)]
    totals_by_month = _monthly_totals_map(db, month_starts)
    total = sum((totals["savings"] for totals in totals_by_month.values()), Decimal("0"))
    return total / months


def category_monthly_trend(
    db: Session, months: int = 6, anchor: date | None = None, type_: str = "expense", top_n: int = 6
) -> dict:
    """Per-category spend for each of the trailing `months` calendar months, for a
    multi-line trend chart. Only the top `top_n` categories (by total spend across the
    window) get their own series; everything else is folded into a '기타' series."""
    anchor = anchor or date.today()
    month_starts = [shift_month(anchor, -offset) for offset in range(months - 1, -1, -1)]
    month_keys = [year_month_str(m) for m in month_starts]
    breakdown_by_month = _category_breakdown_by_month(db, month_starts, type_)
    monthly_breakdowns: list[list[dict]] = [breakdown_by_month[ym] for ym in month_keys]

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
    month_starts = [date(year, month, 1) for month in range(1, 13)]
    totals_by_month = _monthly_totals_map(db, month_starts)
    return [
        {
            "year_month": ym,
            "income": totals_by_month[ym]["income"],
            "expense": totals_by_month[ym]["expense"],
            "fixed": totals_by_month[ym]["fixed"],
            "variable": totals_by_month[ym]["variable"],
            "irregular": totals_by_month[ym]["irregular"],
            "savings": totals_by_month[ym]["savings"],
        }
        for ym in (year_month_str(m) for m in month_starts)
    ]


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


def import_rows(db: Session, rows: list[list[str]], user_id: uuid.UUID) -> dict:
    """Bulk-create transactions from already-split rows matching export_csv's column
    layout (날짜,구분,카테고리,금액,메모,입력자). Shared core for import_csv (CSV 파일)
    and the Google Sheets import paths (google_sheets_service가 이미 셀 단위로 분리해서 준다).
    Unknown categories or malformed rows are skipped and reported, not raised,
    so one bad row doesn't abort an otherwise-good import."""
    categories_by_name = {c.name: c for c in db.query(Category).all()}
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
            db.add(
                Transaction(
                    user_id=user_id,
                    category_id=category.id,
                    type=tx_type,
                    amount=Decimal(raw_amount.strip()),
                    transaction_date=date.fromisoformat(raw_date.strip()),
                    description=description.strip() or None,
                )
            )
            created += 1
        except (ValueError, InvalidOperation, IndexError) as exc:
            skipped.append({"line": line_no, "row": row, "reason": str(exc)})
    db.commit()
    return {"created": created, "skipped": skipped}


def import_csv(db: Session, content: str, user_id: uuid.UUID) -> dict:
    rows = list(csv.reader(io.StringIO(content)))
    return import_rows(db, rows, user_id)


def import_from_sheet_url(db: Session, sheet_url: str, user_id: uuid.UUID) -> dict:
    """공개 링크(링크가 있는 모든 사용자로 공유된 시트)의 CSV 내보내기를 읽어 가져온다."""
    from app.services import google_sheets_service

    csv_text = google_sheets_service.read_public_csv(sheet_url)
    rows = list(csv.reader(io.StringIO(csv_text)))
    return import_rows(db, rows, user_id)


def import_from_spreadsheet(
    db: Session, spreadsheet_id: str, sheet_name: str | None, user_id: uuid.UUID
) -> dict:
    """구글 계정 연동(OAuth)으로 비공개 시트를 Sheets API로 읽어 가져온다."""
    from app.services import google_auth, google_sheets_service

    if not google_auth.is_connected():
        raise google_auth.GoogleNotConnectedError(
            "구글 계정이 연동되어 있지 않습니다. scripts/google_auth_setup.py를 먼저 실행하세요."
        )
    rows = google_sheets_service.read_values(spreadsheet_id, sheet_name)
    return import_rows(db, rows, user_id)
