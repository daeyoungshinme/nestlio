import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services import user_service
from app.utils.dates import month_bounds, shift_month, year_bounds, year_month_str


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


def totals_by_owner(db: Session, date_from: date, date_to: date) -> list[dict]:
    """Income/expense/savings/savings_investment totals per owner (Transaction.owner_user_id
    — who a transaction actually belongs to, tagged explicitly on entry; NULL = "공통" shared
    expense) for a date range. Unlike totals_by_user (which groups by user_id, the person who
    *recorded* the transaction), this reflects the real spending/earning party. Always includes
    every active household user plus the shared bucket, even with zero transactions in range,
    so spouses can be compared side by side at a glance."""
    income_expense_rows = (
        db.query(Transaction.owner_user_id, Transaction.type, func.sum(Transaction.amount))
        .filter(
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
            Transaction.savings_product_id.is_(None),
        )
        .group_by(Transaction.owner_user_id, Transaction.type)
        .all()
    )
    savings_investment_rows = (
        db.query(Transaction.owner_user_id, func.sum(Transaction.amount))
        .filter(
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
            Transaction.savings_product_id.isnot(None),
        )
        .group_by(Transaction.owner_user_id)
        .all()
    )

    all_display_names = {u.id: u.display_name for u in db.query(User).all()}

    def _blank_entry(owner_id: uuid.UUID | None) -> dict:
        display_name = "공통" if owner_id is None else all_display_names.get(owner_id, "알 수 없음")
        return {
            "owner_user_id": owner_id,
            "display_name": display_name,
            "income": Decimal("0"),
            "expense": Decimal("0"),
            "savings_investment": Decimal("0"),
        }

    by_owner: dict[uuid.UUID | None, dict] = {u.id: _blank_entry(u.id) for u in user_service.list_users(db)}
    by_owner[None] = _blank_entry(None)

    for owner_id, tx_type, amount in income_expense_rows:
        entry = by_owner.setdefault(owner_id, _blank_entry(owner_id))
        entry[tx_type] = amount or Decimal("0")
    for owner_id, amount in savings_investment_rows:
        entry = by_owner.setdefault(owner_id, _blank_entry(owner_id))
        entry["savings_investment"] = amount or Decimal("0")

    result = list(by_owner.values())
    for entry in result:
        entry["savings"] = entry["income"] - entry["expense"]
    return sorted(result, key=lambda r: (r["owner_user_id"] is None, r["display_name"]))


def rank_owner_contributions(owner_totals: list[dict]) -> list[dict] | None:
    """totals_by_owner() 결과에서 "공통" 항목을 제외한 실제 배우자 기여자가 2명 이상일 때만,
    savings 내림차순으로 정렬하고 단독 1위(동점이 아닐 때)에게 is_leader=True를 매긴 리스트를
    반환한다. 주간/월간 이메일 요약의 텍스트/HTML 버전이 이 정렬·리더 판정을 공유한다."""
    contributors = [o for o in owner_totals if o["owner_user_id"] is not None]
    if len(contributors) < 2:
        return None
    ranked = sorted(contributors, key=lambda o: o["savings"], reverse=True)
    sole_leader = ranked[0]["savings"] > ranked[1]["savings"]
    return [{**o, "is_leader": sole_leader and i == 0} for i, o in enumerate(ranked)]


def _category_breakdown_base_query(db: Session, date_from: date, date_to: date, type_: str):
    return (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            Category.type,
            Category.is_discretionary,
            Category.is_debt,
            Category.benchmark_group,
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


def _rows_to_category_amounts(rows) -> list[dict]:
    return [
        {
            "category_id": r[0],
            "name": r[1],
            "color": r[2],
            "type": r[3],
            "is_discretionary": r[4],
            "is_debt": r[5],
            "benchmark_group": r[6],
            "amount": r[7],
        }
        for r in rows
    ]


def category_breakdown(
    db: Session, date_from: date, date_to: date, type_: str = "expense", user_id: uuid.UUID | None = None
) -> list[dict]:
    """user_id를 지정하면 해당 사용자가 *기록한* 거래만 집계한다 (가계부 페이지의 "기록자" 필터용).
    배우자 실제 소비 주체 기준 분리는 owner_user_id를 쓰는 category_breakdown_by_owner를 쓴다."""
    query = _category_breakdown_base_query(db, date_from, date_to, type_)
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    rows = query.group_by(Category.id).order_by(func.sum(Transaction.amount).desc()).all()
    return _rows_to_category_amounts(rows)


def category_breakdown_by_owner(
    db: Session,
    date_from: date,
    date_to: date,
    type_: str = "expense",
    owner: uuid.UUID | Literal["shared"] | None = None,
) -> list[dict]:
    """category_breakdown()과 동일한 형태를 반환하지만 Transaction.owner_user_id(거래가 실제로
    누구 몫인지, 입력 시 명시적으로 지정됨) 기준으로 필터한다. owner가 UUID면 그 배우자 몫만,
    "shared"면 공통 지출(owner_user_id IS NULL)만, None이면 가구 전체 합산(필터 없음)."""
    query = _category_breakdown_base_query(db, date_from, date_to, type_)
    if owner == "shared":
        query = query.filter(Transaction.owner_user_id.is_(None))
    elif owner is not None:
        query = query.filter(Transaction.owner_user_id == owner)
    rows = query.group_by(Category.id).order_by(func.sum(Transaction.amount).desc()).all()
    return _rows_to_category_amounts(rows)


def _category_breakdown_by_owner_batch(
    db: Session, date_from: date, date_to: date, type_: str
) -> dict[uuid.UUID | Literal["shared"], list[dict]]:
    """category_breakdown_by_owner()를 모든 owner에 대해 쿼리 1개로 배치 조회한 버전."""
    rows = (
        db.query(
            Transaction.owner_user_id,
            Category.id,
            Category.name,
            Category.color,
            Category.type,
            Category.is_discretionary,
            Category.is_debt,
            Category.benchmark_group,
            func.sum(Transaction.amount),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
            Transaction.savings_product_id.is_(None),
        )
        .group_by(Transaction.owner_user_id, Category.id)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    by_owner: dict[uuid.UUID | Literal["shared"], list[dict]] = {}
    for owner_id, cat_id, name, color, cat_type, is_discretionary, is_debt, benchmark_group, amount in rows:
        owner_key: uuid.UUID | Literal["shared"] = "shared" if owner_id is None else owner_id
        by_owner.setdefault(owner_key, []).append(
            {
                "category_id": cat_id,
                "name": name,
                "color": color,
                "type": cat_type,
                "is_discretionary": is_discretionary,
                "is_debt": is_debt,
                "benchmark_group": benchmark_group,
                "amount": amount or Decimal("0"),
            }
        )
    return by_owner


def _trailing_average_by_owner_batch(
    db: Session, anchor: date, months: int = 3, type_: str = "expense"
) -> dict[uuid.UUID | Literal["shared"], dict[int, Decimal]]:
    """trailing_average_by_category_by_owner()를 모든 owner·달에 대해 쿼리 1개로 배치 조회한
    버전 — owner별로 반복 호출하지 않는다(대시보드는 매 요청마다 이 계산을 필요로 한다)."""
    month_starts = [shift_month(anchor, -offset) for offset in range(1, months + 1)]
    if not month_starts:
        return {}
    range_start = min(month_starts)
    range_end = month_bounds(max(month_starts))[1]
    rows = (
        db.query(Transaction.owner_user_id, Transaction.category_id, Transaction.amount)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Transaction.transaction_date >= range_start,
            Transaction.transaction_date <= range_end,
            Transaction.savings_product_id.is_(None),
        )
        .all()
    )
    totals: dict[uuid.UUID | Literal["shared"], dict[int, Decimal]] = {}
    for owner_id, cat_id, amount in rows:
        owner_key: uuid.UUID | Literal["shared"] = "shared" if owner_id is None else owner_id
        bucket = totals.setdefault(owner_key, {})
        bucket[cat_id] = bucket.get(cat_id, Decimal("0")) + (amount or Decimal("0"))
    return {
        owner_key: {cat_id: total / months for cat_id, total in cat_totals.items()}
        for owner_key, cat_totals in totals.items()
    }


def top_overspend_categories(
    current_breakdown: list[dict], avg_by_category: dict[int, Decimal], top_n: int = 1
) -> list[dict]:
    """이번 기간 카테고리별 지출을 최근 평균과 비교해, 평균보다 늘어난 카테고리를 증가폭이
    큰 순으로 top_n개 뽑는다 (대시보드 "여기서 줄이면 저축 여력이 생겨요" 하이라이트용)."""
    rows = []
    for row in current_breakdown:
        avg = avg_by_category.get(row["category_id"], Decimal("0"))
        delta = row["amount"] - avg
        if delta > 0:
            rows.append(
                {
                    "category_name": row["name"],
                    "amount": row["amount"],
                    "avg_amount": avg,
                    "delta": delta,
                }
            )
    rows.sort(key=lambda r: r["delta"], reverse=True)
    return rows[:top_n]


def owner_spending_detail(
    db: Session,
    date_from: date,
    date_to: date,
    owner_totals: list[dict],
    anchor_month_start: date,
) -> list[dict]:
    """totals_by_owner()가 반환한 owner_totals(배우자 각각 + 공통) 각각에 대해, 최근 3개월
    평균보다 지출이 늘어난 카테고리 하이라이트를 만든다 (대시보드 "부부별 지출 상세" 카드용).
    owner마다 반복 쿼리하지 않고 쿼리 2개(현재 기간 카테고리 breakdown, 최근 3개월 평균)로
    전체 owner를 배치 조회한다."""
    breakdown_by_owner = _category_breakdown_by_owner_batch(db, date_from, date_to, "expense")
    avg_by_owner = _trailing_average_by_owner_batch(db, anchor_month_start)
    highlight_out: list[dict] = []
    for owner in owner_totals:
        owner_key: uuid.UUID | Literal["shared"] = "shared" if owner["owner_user_id"] is None else owner["owner_user_id"]
        categories = breakdown_by_owner.get(owner_key, [])
        avg_by_category = avg_by_owner.get(owner_key, {})
        for highlight in top_overspend_categories(categories, avg_by_category, top_n=1):
            highlight_out.append(
                {"owner_user_id": owner["owner_user_id"], "display_name": owner["display_name"], **highlight}
            )
    return highlight_out


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
    return {section: total / months for section, total in sums.items()}


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
