"""소비 절감 점검 — "어디서 줄일 수 있나"를 규칙 기반(non-AI)으로 찾아 월 절감 추정액과 함께 돌려준다.

coaching_engine이 "경고 문구"를 만든다면, 여기는 같은 데이터에서 **얼마를 줄일 수 있는지**를 계산한다.
규칙은 모두 순수 함수(집계값 → SavingOpportunity)이고 DB를 읽는 건 `build_spending_review` 하나뿐이다.

기준월은 기본으로 지난달(마감된 달)이다 — 진행 중인 달은 지출이 덜 찼으므로 평균과 비교하면 늘 "줄었다"로 보인다.

임계값(app/config.py settings):
  spending_review_lookback_months — 기준월 직전 몇 개월을 평균·벤치마크 기간으로 볼지
  chronic_overrun_months          — 몇 개월 연속 예산을 넘으면 "만성 초과"인지
  recurring_detect_window/min_months, recurring_detect_tolerance_pct
                                  — 반복거래로 등록 안 된 정기결제 탐지: 최근 window개월 중 min개월 이상,
                                    금액이 중앙값 ±tolerance% 안
  small_spend_max_amount/min_count, small_spend_cut_pct
                                  — 재량 카테고리 소액 지출(≤max)이 월 min_count회 이상이면 합계의 cut_pct%를 절감 추정
  variable_trend_flag_pct (코칭엔진과 공유), benchmark_*_warn_pct (가구 조정값)

중복 합산 방지: 카테고리 단위 규칙(trend_up/benchmark_excess/chronic_overrun/small_frequent)은 카테고리가 겹치면
절감 추정이 가장 큰 것 하나만 남기고 나머지는 `related` 근거로 붙인다. 항목 단위 규칙(subscription/
unregistered_recurring)은 각각 보여주되, 총액에서는 같은 카테고리의 카테고리 단위 기회와 max로 합친다.
"""
import re
import statistics
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.benchmark_groups import BENCHMARK_GROUPS
from app.models.category import Category
from app.models.recurring_expense import RecurringExpense
from app.models.transaction import Transaction
from app.services import budget_service, coaching_engine, coaching_settings_service, transaction_report_service
from app.utils.dates import month_bounds, parse_year_month, shift_month, today_kst, year_month_str
from app.utils.money import monthly_equivalent, whole_won

CATEGORY_LEVEL_RULES = ("trend_up", "benchmark_excess", "chronic_overrun", "small_frequent")
ITEM_LEVEL_RULES = ("subscription", "unregistered_recurring")

# 정기결제 후보에서 뺄 벤치마크 그룹 — 주거·보험은 "구독 해지"로 줄이는 대상이 아니다(보험은 보험 점검이 따로 본다).
_NON_CUTTABLE_GROUPS = frozenset({"housing", "insurance"})


@dataclass(frozen=True)
class CategoryMeta:
    id: int
    name: str
    type: str
    is_discretionary: bool = False
    is_debt: bool = False
    is_savings: bool = False
    benchmark_group: str | None = None


@dataclass(frozen=True)
class TxRow:
    year_month: str
    type: str  # 'income' | 'expense'
    category_id: int
    amount: Decimal
    description: str | None = None
    recurring_expense_id: int | None = None
    owner_user_id: uuid.UUID | None = None


@dataclass
class SavingOpportunity:
    rule_code: str
    severity: str  # 'info' | 'warning' | 'critical'
    title: str
    detail: str
    current_monthly_amount: Decimal
    estimated_monthly_saving: Decimal
    category_ids: frozenset[int]
    related: list[str] = field(default_factory=list)

    @property
    def category_id(self) -> int | None:
        return next(iter(self.category_ids)) if len(self.category_ids) == 1 else None


def is_cuttable_category(meta: CategoryMeta) -> bool:
    """정기결제(구독) 후보가 될 수 있는 카테고리 — 대출상환·저축·주거·보험은 제외. 보험은 benchmark_group이
    태깅되지 않은 가구가 많아 이름("보험료", "자동차세/보험료")으로도 거른다."""
    if meta.is_debt or meta.is_savings:
        return False
    if meta.benchmark_group in _NON_CUTTABLE_GROUPS:
        return False
    return "보험" not in meta.name


def _won(amount: Decimal) -> str:
    return f"{amount:,.0f}원"


# --- 카테고리 단위 규칙 ------------------------------------------------------------------------


def trend_up_opportunities(
    current: dict[int, Decimal],
    trailing_avg: dict[int, Decimal],
    meta: dict[int, CategoryMeta],
    flag_pct: float,
    months: int,
) -> list[SavingOpportunity]:
    """변동비 카테고리가 직전 평균보다 flag_pct% 이상 늘면, 늘어난 만큼(현재 − 평균)을 절감 추정으로."""
    result = []
    for cat_id, amount in current.items():
        cat = meta.get(cat_id)
        avg = trailing_avg.get(cat_id, Decimal("0"))
        if cat is None or cat.type != "variable" or avg <= 0:
            continue
        change_pct = float((amount - avg) / avg * 100)
        if change_pct < flag_pct:
            continue
        result.append(
            SavingOpportunity(
                rule_code="trend_up",
                severity="warning",
                title=f"{cat.name} 지출이 평소보다 {change_pct:.0f}% 늘었어요",
                detail=f"직전 {months}개월 평균 {_won(avg)} → 이번 {_won(amount)}. 평소 수준으로 돌아오면 월 {_won(amount - avg)}을 아낄 수 있어요.",
                current_monthly_amount=amount,
                estimated_monthly_saving=whole_won(amount - avg),
                category_ids=frozenset({cat_id}),
            )
        )
    return result


def benchmark_excess_opportunities(
    avg_income: Decimal,
    avg_by_category: dict[int, Decimal],
    meta: dict[int, CategoryMeta],
    benchmark_pcts: dict[str, float],
) -> list[SavingOpportunity]:
    """benchmark_group별 평균 지출이 소득 대비 가이드라인(%)을 넘으면, 가이드라인까지 줄인 차액을 절감 추정으로.
    가이드라인과 정확히 같으면 줄일 몫이 0이므로 내지 않는다."""
    if avg_income <= 0:
        return []
    group_amounts: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    group_categories: dict[str, set[int]] = defaultdict(set)
    for cat_id, amount in avg_by_category.items():
        cat = meta.get(cat_id)
        if cat is None or cat.benchmark_group not in benchmark_pcts or amount <= 0:
            continue
        group_amounts[cat.benchmark_group] += amount
        group_categories[cat.benchmark_group].add(cat_id)
    result = []
    for group, amount in group_amounts.items():
        guideline_pct = benchmark_pcts[group]
        guideline_amount = avg_income * Decimal(str(guideline_pct)) / 100
        excess = whole_won(amount - guideline_amount)
        if excess <= 0:
            continue
        pct = float(amount / avg_income * 100)
        label = BENCHMARK_GROUPS.get(group, group)
        result.append(
            SavingOpportunity(
                rule_code="benchmark_excess",
                severity="warning",
                title=f"{label} 지출이 소득의 {pct:.0f}%예요 (가이드라인 {guideline_pct:.0f}%)",
                detail=f"월 평균 {_won(amount)} 중 가이드라인을 넘는 {_won(excess)}이 줄일 여지예요.",
                current_monthly_amount=amount,
                estimated_monthly_saving=excess,
                category_ids=frozenset(group_categories[group]),
            )
        )
    return result


def chronic_overrun_opportunities(
    monthly: list[tuple[dict[int, Decimal], dict[int, Decimal]]], meta: dict[int, CategoryMeta]
) -> list[SavingOpportunity]:
    """monthly = 오래된 달부터 [(예산, 실적)]. 모든 달에 예산(>0)을 넘은 카테고리만 — 평균 초과액을 절감 추정으로."""
    if not monthly:
        return []
    candidate_ids = set(monthly[-1][0])
    result = []
    for cat_id in sorted(candidate_ids):
        overruns = []
        for budgets, actuals in monthly:
            budget = budgets.get(cat_id, Decimal("0"))
            actual = actuals.get(cat_id, Decimal("0"))
            if budget <= 0 or actual <= budget:
                break
            overruns.append(actual - budget)
        else:
            cat = meta.get(cat_id)
            if cat is None:
                continue
            avg_over = whole_won(sum(overruns, Decimal("0")) / len(overruns))
            result.append(
                SavingOpportunity(
                    rule_code="chronic_overrun",
                    severity="critical",
                    title=f"{cat.name} 지출이 {len(monthly)}개월 연속 예산을 넘었어요",
                    detail=f"매달 평균 {_won(avg_over)}씩 초과했어요. 지출을 줄이거나, 현실적인 예산으로 다시 잡아 보세요.",
                    current_monthly_amount=monthly[-1][1].get(cat_id, Decimal("0")),
                    estimated_monthly_saving=avg_over,
                    category_ids=frozenset({cat_id}),
                )
            )
    return result


def small_frequent_opportunities(
    rows: list[TxRow], meta: dict[int, CategoryMeta], max_amount: Decimal, min_count: int, cut_pct: float
) -> list[SavingOpportunity]:
    """기준월 거래(rows)에서 재량 카테고리의 소액(≤max_amount) 지출이 min_count회 이상이면 합계의 cut_pct%를 절감 추정으로."""
    counts: Counter[int] = Counter()
    sums: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in rows:
        cat = meta.get(row.category_id)
        if row.type != "expense" or cat is None or not cat.is_discretionary or row.amount > max_amount:
            continue
        counts[row.category_id] += 1
        sums[row.category_id] += row.amount
    result = []
    for cat_id, count in counts.items():
        if count < min_count:
            continue
        total = sums[cat_id]
        saving = whole_won(total * Decimal(str(cut_pct)) / 100)
        result.append(
            SavingOpportunity(
                rule_code="small_frequent",
                severity="info",
                title=f"{meta[cat_id].name}에서 소액 결제가 {count}번 있었어요",
                detail=f"{_won(max_amount)} 이하 결제 합계 {_won(total)}. {cut_pct:.0f}%만 줄여도 월 {_won(saving)}예요.",
                current_monthly_amount=total,
                estimated_monthly_saving=saving,
                category_ids=frozenset({cat_id}),
            )
        )
    return result


# --- 항목 단위 규칙 ----------------------------------------------------------------------------


def subscription_opportunities(
    recurrings: list[RecurringExpense], meta: dict[int, CategoryMeta]
) -> list[SavingOpportunity]:
    """활성 반복지출 중 해지로 줄일 수 있는 카테고리의 것 — 월 환산액 전액을 "필요한지 점검" 대상으로."""
    result = []
    for rec in recurrings:
        cat = meta.get(rec.category_id)
        if rec.type != "expense" or cat is None or not is_cuttable_category(cat):
            continue
        monthly = monthly_equivalent(rec.amount, rec.frequency, len(rec.days_of_month or []) or 1)
        if monthly <= 0:
            continue
        result.append(
            SavingOpportunity(
                rule_code="subscription",
                severity="info",
                title=f"정기결제 점검: {rec.name}",
                detail=f"{cat.name} · 월 {_won(monthly)}. 요즘도 잘 쓰고 있는지 둘이 한 번 확인해 보세요.",
                current_monthly_amount=monthly,
                estimated_monthly_saving=monthly,
                category_ids=frozenset({rec.category_id}),
            )
        )
    return result


def normalize_description(description: str | None) -> str:
    """'넷플릭스 10월', 'NETFLIX.COM ' → 같은 키가 되도록 숫자·공백·기호를 떼고 소문자로."""
    if not description:
        return ""
    without_dates = re.sub(r"\d+\s*(월|일|회차|회)", "", description.lower())
    return re.sub(r"[\d\W_]+", "", without_dates)


def unregistered_recurring_opportunities(
    rows: list[TxRow],
    months: list[str],
    meta: dict[int, CategoryMeta],
    min_months: int,
    tolerance_pct: float,
    registered_names: frozenset[str] | set[str] = frozenset(),
) -> list[SavingOpportunity]:
    """반복거래로 등록 안 된 거래 중 같은 내용(정규화)이 months 중 min_months개월 이상, 금액이 중앙값 ±tolerance%로
    반복되면 정기결제로 본다. rows는 months 기간의 거래여야 한다."""
    month_set = set(months)
    per_key: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0")))
    categories: dict[str, Counter[int]] = defaultdict(Counter)
    latest_desc: dict[str, tuple[str, str]] = {}
    for row in rows:
        if row.type != "expense" or row.recurring_expense_id is not None or row.year_month not in month_set:
            continue
        cat = meta.get(row.category_id)
        key = normalize_description(row.description)
        if not key or key in registered_names or cat is None or not is_cuttable_category(cat):
            continue
        per_key[key][row.year_month] += row.amount
        categories[key][row.category_id] += 1
        if key not in latest_desc or row.year_month >= latest_desc[key][0]:
            latest_desc[key] = (row.year_month, row.description.strip())
    result = []
    tolerance = Decimal(str(tolerance_pct)) / 100
    for key, by_month in per_key.items():
        if len(by_month) < min_months:
            continue
        amounts = list(by_month.values())
        median = Decimal(statistics.median(amounts))
        if median <= 0 or any(abs(a - median) > median * tolerance for a in amounts):
            continue
        cat_id = categories[key].most_common(1)[0][0]
        monthly = whole_won(median)
        name = latest_desc[key][1]
        result.append(
            SavingOpportunity(
                rule_code="unregistered_recurring",
                severity="info",
                title=f"매달 나가는 결제 같아요: {name}",
                detail=f"최근 {len(months)}개월 중 {len(by_month)}개월, 월 {_won(monthly)}. 반복거래로 등록하고 계속 필요한지 확인해 보세요.",
                current_monthly_amount=monthly,
                estimated_monthly_saving=monthly,
                category_ids=frozenset({cat_id}),
            )
        )
    return result


# --- 정리 -------------------------------------------------------------------------------------


def merge_opportunities(candidates: list[SavingOpportunity]) -> tuple[list[SavingOpportunity], Decimal]:
    """(정렬된 결과, 총 절감 추정). 카테고리 단위 규칙끼리는 카테고리가 겹치면 큰 것 하나만 남기고 나머지 제목을
    related로 붙인다. 항목 단위 규칙은 모두 남기되, 총액에선 겹치는 카테고리 단위 기회와 max로 합친다."""
    _rank = {"critical": 0, "warning": 1, "info": 2}
    category_level = sorted(
        (c for c in candidates if c.rule_code in CATEGORY_LEVEL_RULES),
        key=lambda c: (-c.estimated_monthly_saving, _rank.get(c.severity, 3)),
    )
    kept: list[SavingOpportunity] = []
    for cand in category_level:
        owner = next((k for k in kept if k.category_ids & cand.category_ids), None)
        if owner is None:
            kept.append(cand)
        else:
            owner.related.append(cand.title)
    items = [c for c in candidates if c.rule_code in ITEM_LEVEL_RULES]

    total = Decimal("0")
    absorbed: set[int] = set()
    for k in kept:
        overlapping = [i for i, item in enumerate(items) if item.category_ids & k.category_ids]
        absorbed.update(overlapping)
        item_sum = sum((items[i].estimated_monthly_saving for i in overlapping), Decimal("0"))
        total += max(k.estimated_monthly_saving, item_sum)
    total += sum((item.estimated_monthly_saving for i, item in enumerate(items) if i not in absorbed), Decimal("0"))

    merged = sorted(kept + items, key=lambda c: (-c.estimated_monthly_saving, _rank.get(c.severity, 3)))
    return merged, total


# --- DB-aware 래퍼 ----------------------------------------------------------------------------


def _category_meta(db: Session) -> dict[int, CategoryMeta]:
    return {
        c.id: CategoryMeta(
            id=c.id,
            name=c.name,
            type=c.type,
            is_discretionary=bool(c.is_discretionary),
            is_debt=bool(c.is_debt),
            is_savings=bool(c.is_savings),
            benchmark_group=c.benchmark_group,
        )
        for c in db.query(Category).all()
    }


def _tx_rows(db: Session, date_from: date, date_to: date) -> list[TxRow]:
    rows = (
        db.query(
            Transaction.transaction_date,
            Transaction.type,
            Transaction.category_id,
            Transaction.amount,
            Transaction.description,
            Transaction.recurring_expense_id,
            Transaction.owner_user_id,
        )
        .filter(*transaction_report_service.period_expense_filters(date_from, date_to))
        .all()
    )
    return [
        TxRow(year_month_str(d), tx_type, cat_id, amount or Decimal("0"), desc, rec_id, owner_id)
        for d, tx_type, cat_id, amount, desc, rec_id, owner_id in rows
    ]


def _sum_by_category(rows: list[TxRow]) -> dict[int, Decimal]:
    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in rows:
        if row.type == "expense":
            totals[row.category_id] += row.amount
    return dict(totals)


def _matches_owner(row: TxRow, owner: uuid.UUID | Literal["shared"] | None) -> bool:
    if owner is None:
        return True
    if owner == "shared":
        return row.owner_user_id is None
    return row.owner_user_id == owner


def default_year_month(today: date) -> str:
    """기본 기준월 = 지난달(마감된 달)."""
    return year_month_str(shift_month(today, -1))


def build_spending_review(
    db: Session,
    year_month: str | None = None,
    *,
    owner: uuid.UUID | Literal["shared"] | None = None,
    today: date | None = None,
    thresholds: dict[str, float] | None = None,
) -> dict:
    """기준월 소비 절감 점검. owner를 주면 거래 기반 규칙만 그 배우자(또는 "shared"=공통) 몫으로 좁힌다 —
    소득(벤치마크 분모)은 가구 전체 그대로, 예산·반복거래는 가구 단위라 owner 필터 시 만성 초과·정기결제 규칙은 건너뛴다."""
    today = today or today_kst()
    year_month = year_month or default_year_month(today)
    anchor = parse_year_month(year_month)
    lookback = settings.spending_review_lookback_months
    history_months = [year_month_str(shift_month(anchor, -o)) for o in range(lookback, 0, -1)]
    window_start = shift_month(anchor, -lookback)
    all_rows = _tx_rows(db, window_start, month_bounds(anchor)[1])
    meta = _category_meta(db)
    thresholds = thresholds if thresholds is not None else coaching_settings_service.get_thresholds(db)

    # 기록이 시작되기 전 달까지 0원으로 평균에 넣으면 평균이 희석된다 — 거래가 하나라도 있는 달만 센다(가구 기준).
    active_history = sorted({r.year_month for r in all_rows if r.year_month in set(history_months)})
    rows = [r for r in all_rows if _matches_owner(r, owner)]
    by_month: dict[str, list[TxRow]] = defaultdict(list)
    for row in rows:
        by_month[row.year_month].append(row)
    current_rows = by_month.get(year_month, [])
    current = _sum_by_category(current_rows)

    candidates: list[SavingOpportunity] = []
    if active_history:
        history_rows = [r for m in active_history for r in by_month.get(m, [])]
        trailing_avg = {
            cat_id: whole_won(total / len(active_history)) for cat_id, total in _sum_by_category(history_rows).items()
        }
        candidates += trend_up_opportunities(
            current, trailing_avg, meta, settings.variable_trend_flag_pct, len(active_history)
        )

    benchmark_months = [*active_history, year_month]
    income_total = sum((r.amount for r in all_rows if r.type == "income" and r.year_month in benchmark_months), Decimal("0"))
    benchmark_rows = [r for m in benchmark_months for r in by_month.get(m, [])]
    avg_by_category = {
        cat_id: whole_won(total / len(benchmark_months)) for cat_id, total in _sum_by_category(benchmark_rows).items()
    }
    candidates += benchmark_excess_opportunities(
        whole_won(income_total / len(benchmark_months)),
        avg_by_category,
        meta,
        coaching_engine.benchmark_pcts_from_thresholds(thresholds),
    )

    candidates += small_frequent_opportunities(
        current_rows,
        meta,
        Decimal(settings.small_spend_max_amount),
        settings.small_spend_min_count,
        settings.small_spend_cut_pct,
    )

    detect_months = [year_month_str(shift_month(anchor, -o)) for o in range(settings.recurring_detect_window_months - 1, -1, -1)]
    recurrings = db.query(RecurringExpense).filter(RecurringExpense.is_active.is_(True)).all()
    candidates += unregistered_recurring_opportunities(
        [r for m in detect_months for r in by_month.get(m, [])],
        detect_months,
        meta,
        settings.recurring_detect_min_months,
        settings.recurring_detect_tolerance_pct,
        registered_names={normalize_description(rec.name) for rec in recurrings},
    )

    if owner is None:
        overrun_months = [shift_month(anchor, -o) for o in range(settings.chronic_overrun_months - 1, -1, -1)]
        monthly = [
            (budget_service.get_budgets_for_month(db, year_month_str(m)), _sum_by_category(by_month.get(year_month_str(m), [])))
            for m in overrun_months
        ]
        candidates += chronic_overrun_opportunities(monthly, meta)
        candidates += subscription_opportunities(recurrings, meta)

    items, total = merge_opportunities(candidates)
    return {
        "year_month": year_month,
        "months_analyzed": len(active_history),
        "items": [
            {
                "rule_code": item.rule_code,
                "severity": item.severity,
                "category_id": item.category_id,
                "title": item.title,
                "detail": item.detail,
                "current_monthly_amount": item.current_monthly_amount,
                "estimated_monthly_saving": item.estimated_monthly_saving,
                "related": item.related,
            }
            for item in items
        ],
        "total_estimated_monthly_saving": total,
    }
