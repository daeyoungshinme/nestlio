"""시계열·평균 집계 — 월별 추이(`monthly_trend`), 직전 N개월 평균(`trailing_average_by_*`), 카테고리 추이 차트,
연간 월별 표. 한 기간을 자르는 집계(합계·카테고리·부부별)는 `transaction_report_service`에 있고, 여기는 그걸
여러 달에 걸쳐 한 쿼리로 묶어 내는 쪽이다(`_monthly_totals_map`/`_category_breakdown_by_month`)."""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.services import transaction_report_service
from app.utils.dates import month_bounds, shift_month, today_kst, year_bounds, year_month_str
from app.utils.money import whole_won


def _monthly_totals_map(db: Session, month_starts: list[date]) -> dict[str, dict]:
    """transaction_report_service.period_totals(), batched into a single query, grouped by calendar month.
    `month_starts` must be the first-of-month dates to report on (need not be contiguous)."""
    result = {year_month_str(m): transaction_report_service.empty_totals() for m in month_starts}
    if not month_starts:
        return result
    range_start = min(month_starts)
    range_end = month_bounds(max(month_starts))[1]
    rows = (
        db.query(Transaction.transaction_date, Transaction.type, Category.type, Transaction.amount)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            *transaction_report_service.period_expense_filters(range_start, range_end),
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
            Category.benchmark_group,
            Transaction.amount,
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            *transaction_report_service.period_expense_filters(range_start, range_end),
        )
        .all()
    )
    for tx_date, cat_id, *category_fields, amount in rows:
        bucket = by_month.get(year_month_str(tx_date))
        if bucket is None:
            continue
        entry = bucket.setdefault(cat_id, transaction_report_service.category_row(cat_id, *category_fields, Decimal("0")))
        entry["amount"] += amount or Decimal("0")
    return {ym: sorted(bucket.values(), key=lambda r: r["amount"], reverse=True) for ym, bucket in by_month.items()}


def monthly_trend(db: Session, months: int = 6, anchor: date | None = None) -> list[dict]:
    """Income/expense totals for the trailing `months` calendar months, oldest first."""
    anchor = anchor or today_kst()
    month_starts = [shift_month(anchor, -offset) for offset in range(months - 1, -1, -1)]
    return _monthly_rows(db, month_starts)


def _monthly_rows(db: Session, month_starts: list[date]) -> list[dict]:
    """month_starts 순서대로 월별 합계 행(year_month + income/expense/fixed/variable/irregular/savings)."""
    totals_by_month = _monthly_totals_map(db, month_starts)
    return [{"year_month": ym, **totals_by_month[ym]} for ym in (year_month_str(m) for m in month_starts)]


def trailing_average_by_category(db: Session, anchor: date, months: int = 3, type_: str = "expense") -> dict[int, Decimal]:
    """Average per-category spend over the `months` immediately before anchor's month (excludes anchor's month)."""
    month_starts = [shift_month(anchor, -offset) for offset in range(1, months + 1)]
    breakdown_by_month = _category_breakdown_by_month(db, month_starts, type_)
    totals: dict[int, Decimal] = {}
    for rows in breakdown_by_month.values():
        for row in rows:
            totals[row["category_id"]] = totals.get(row["category_id"], Decimal("0")) + row["amount"]
    return {cat_id: whole_won(total / months) for cat_id, total in totals.items()}


def trailing_average_by_section(db: Session, anchor: date, months: int = 3) -> dict[str, Decimal]:
    """Average income/fixed/variable/irregular totals over the `months` immediately before
    anchor's month (excludes anchor's month) — section-level counterpart to
    trailing_average_by_category, used to suggest next month's cashflow plan amounts."""
    month_starts = [shift_month(anchor, -offset) for offset in range(1, months + 1)]
    totals_by_month = _monthly_totals_map(db, month_starts)
    sections = ("income", "fixed", "variable", "irregular")
    sums = {section: Decimal("0") for section in sections}
    for totals in totals_by_month.values():
        for section in sections:
            sums[section] += totals[section]
    return {section: whole_won(total / months) for section, total in sums.items()}


def category_monthly_trend(
    db: Session, months: int = 6, anchor: date | None = None, type_: str = "expense", top_n: int = 6
) -> dict:
    """Per-category spend for each of the trailing `months` calendar months, for a
    multi-line trend chart. Only the top `top_n` categories (by total spend across the
    window) get their own series; everything else is folded into a '기타' series."""
    anchor = anchor or today_kst()
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
    return _monthly_rows(db, [date(year, month, 1) for month in range(1, 13)])


def yearly_totals(db: Session, year: int) -> dict:
    start, end = year_bounds(year)
    return transaction_report_service.period_totals(db, start, end)
