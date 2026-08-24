"""Rule-based (non-AI) financial coaching. Every function here is a pure calculation
over already-fetched numbers, so the thresholds can be exhaustively unit tested."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.benchmark_groups import BENCHMARK_GROUPS, COMPARABLE_BENCHMARK_GROUPS
from app.models.financial_goal import FinancialGoal
from app.services import (
    budget_service,
    coaching_settings_service,
    goal_service,
    net_worth_service,
    savings_product_service,
    transaction_report_service,
)
from app.utils.dates import month_bounds, parse_year_month, year_month_str

# months to keep emergency fund runway comfortably inside
EMERGENCY_FUND_MIN_MONTHS = 3
EMERGENCY_FUND_TARGET_MONTHS = 6

# goal pace: actual savings vs sum of goals' monthly_saving_amount (percentage of target)
GOAL_PACE_CRITICAL_PCT = 70
GOAL_PACE_INFO_PCT = 100

# savings execution: actual net-worth savings_total growth vs theoretical surplus (income - expense)
SAVINGS_EXECUTION_CRITICAL_PCT = 50
SAVINGS_EXECUTION_WARN_PCT = 80

# variable-spend vs trailing-3-month-average flag threshold (percentage points)
VARIABLE_TREND_FLAG_PCT = 20


@dataclass
class Insight:
    rule_code: str
    severity: str  # 'info' | 'warning' | 'critical'
    message: str


def _pct(numerator: Decimal, denominator: Decimal) -> float:
    if not denominator:
        return 0.0
    return float(numerator / denominator * 100)


def savings_rate_insight(totals: dict, warn_pct: float | None = None, critical_pct: float | None = None) -> Insight | None:
    income = totals["income"]
    if income <= 0:
        return None
    warn_pct = settings.savings_rate_warn if warn_pct is None else warn_pct
    critical_pct = settings.savings_rate_critical if critical_pct is None else critical_pct
    rate = _pct(totals["savings"], income)
    if rate < critical_pct:
        return Insight("savings_rate", "critical", f"이번달 저축률이 {rate:.0f}%로 매우 낮습니다. 지출을 점검해보세요.")
    if rate < warn_pct:
        return Insight("savings_rate", "warning", f"이번달 저축률이 {rate:.0f}%입니다. 목표({warn_pct:.0f}%)보다 낮아요.")
    return Insight("savings_rate", "info", f"이번달 저축률 {rate:.0f}% — 두 분 다 잘하고 계세요!")


def fixed_cost_ratio_insight(
    totals: dict, warn_pct: float | None = None, critical_pct: float | None = None
) -> Insight | None:
    income = totals["income"]
    if income <= 0:
        return None
    warn_pct = settings.fixed_cost_ratio_warn if warn_pct is None else warn_pct
    critical_pct = settings.fixed_cost_ratio_critical if critical_pct is None else critical_pct
    ratio = _pct(totals["fixed"], income)
    if ratio >= critical_pct:
        return Insight("fixed_cost_ratio", "critical", f"고정비가 소득의 {ratio:.0f}%를 차지합니다. 부담이 큰 수준이에요.")
    if ratio >= warn_pct:
        return Insight("fixed_cost_ratio", "warning", f"고정비가 소득의 {ratio:.0f}%입니다. 조금 높은 편이에요.")
    return None


def budget_overrun_insights(budget_rows: list[dict]) -> list[Insight]:
    insights = []
    for row in budget_rows:
        if row["budget"] <= 0 or row["status"] not in ("warn", "critical"):
            continue
        severity = "critical" if row["status"] == "critical" else "warning"
        insights.append(
            Insight(
                "budget_overrun",
                severity,
                f"{row['name']} 예산 {row['pct']:.0f}% 사용 "
                f"({row['actual']:,.0f}원 / {row['budget']:,.0f}원)",
            )
        )
    return insights


def variable_spend_trend_insights(current_breakdown: list[dict], trailing_avg: dict[int, Decimal]) -> list[Insight]:
    insights = []
    for row in current_breakdown:
        if row["type"] != "variable":
            continue
        avg = trailing_avg.get(row["category_id"])
        if not avg:
            continue
        change_pct = _pct(row["amount"] - avg, avg)
        if change_pct >= VARIABLE_TREND_FLAG_PCT:
            insights.append(
                Insight(
                    "variable_spend_trend",
                    "warning",
                    f"{row['name']} 지출이 최근 3개월 평균보다 {change_pct:.0f}% 늘었습니다.",
                )
            )
    return insights


def discretionary_ratio_insight(
    totals: dict, category_breakdown: list[dict], warn_pct: float | None = None
) -> Insight | None:
    income = totals["income"]
    if income <= 0:
        return None
    warn_pct = settings.discretionary_ratio_warn if warn_pct is None else warn_pct
    discretionary_total = sum(
        (row["amount"] for row in category_breakdown if row.get("is_discretionary")),
        Decimal("0"),
    )
    ratio = _pct(discretionary_total, income)
    if ratio >= warn_pct:
        return Insight("discretionary_ratio", "warning", f"여가/쇼핑 지출이 소득의 {ratio:.0f}%입니다.")
    return None


def debt_ratio_insight(
    totals: dict, category_breakdown: list[dict], warn_pct: float | None = None
) -> Insight | None:
    income = totals["income"]
    if income <= 0:
        return None
    warn_pct = settings.debt_ratio_warn if warn_pct is None else warn_pct
    debt_total = sum(
        (row["amount"] for row in category_breakdown if row.get("is_debt")), Decimal("0")
    )
    ratio = _pct(debt_total, income)
    if ratio >= warn_pct:
        return Insight("debt_ratio", "warning", f"대출상환이 소득의 {ratio:.0f}%입니다. (권장 {warn_pct:.0f}% 이하)")
    return None


CATEGORY_BENCHMARK_TOP_N = 2


def benchmark_pcts_from_thresholds(thresholds: dict[str, float]) -> dict[str, float]:
    """category_benchmark_rows()에 넘길 group→경고 임계값 매핑을 settings/coaching_settings_service의
    thresholds에서 뽑아낸다. "other"처럼 가이드라인이 없는 그룹은 COMPARABLE_BENCHMARK_GROUPS 기준으로 제외."""
    return {group: thresholds[f"benchmark_{group}_warn_pct"] for group in COMPARABLE_BENCHMARK_GROUPS}


def category_benchmark_rows(
    totals: dict, category_breakdown: list[dict], benchmark_pcts: dict[str, float]
) -> list[dict]:
    """카테고리별 지출을 표준 그룹(app.constants.benchmark_groups.BENCHMARK_GROUPS)으로 합산해
    소득 대비 비중을 "일반적인 2인 가구" 가이드라인 비율과 비교한다. `benchmark_group`이
    태깅되지 않은 카테고리(대부분의 기존 카테고리)는 집계에서 제외되고, 태깅됐더라도
    benchmark_pcts에 없는 그룹("other" 등 가이드라인이 없는 그룹)도 결과에 포함하지 않는다."""
    income = totals["income"]
    if income <= 0:
        return []
    group_totals: dict[str, Decimal] = {}
    for row in category_breakdown:
        group = row.get("benchmark_group")
        if not group or group not in benchmark_pcts:
            continue
        group_totals[group] = group_totals.get(group, Decimal("0")) + row["amount"]
    rows = []
    for group, amount in group_totals.items():
        benchmark_pct = benchmark_pcts[group]
        pct = _pct(amount, income)
        rows.append(
            {
                "group": group,
                "label": BENCHMARK_GROUPS.get(group, group),
                "amount": amount,
                "pct": pct,
                "benchmark_pct": benchmark_pct,
                "status": "warn" if pct >= benchmark_pct else "ok",
            }
        )
    return rows


def category_benchmark_insights(rows: list[dict]) -> list[Insight]:
    """category_benchmark_rows 결과 중 가이드라인을 초과한 그룹만 초과폭이 큰 순으로 변환한다.
    compute_insights가 상위 CATEGORY_BENCHMARK_TOP_N개만 대시보드 알림에 노출한다 — 전체 비교표는
    연간 리포트(app/routers/reports.py)가 별도로 보여준다."""
    warn_rows = [row for row in rows if row["status"] == "warn"]
    warn_rows.sort(key=lambda row: row["pct"] - row["benchmark_pct"], reverse=True)
    return [
        Insight(
            "category_benchmark",
            "warning",
            f"{row['label']} 지출이 소득의 {row['pct']:.0f}%로 일반적인 가이드라인"
            f"({row['benchmark_pct']:.0f}%)보다 높아요. 여유가 생기면 저축·투자를 늘려보는 건 어때요?",
        )
        for row in warn_rows
    ]


def goal_pace_insight(totals: dict, goals: list[dict]) -> Insight | None:
    target_monthly = sum((g["monthly_saving_amount"] for g in goals), Decimal("0"))
    if target_monthly <= 0:
        return None
    pct = _pct(totals["savings"], target_monthly)
    if pct < GOAL_PACE_CRITICAL_PCT:
        return Insight(
            "goal_pace",
            "critical",
            f"이번달 저축액이 목표 월 저축액의 {pct:.0f}%예요. 목표 페이스에 많이 못 미쳤어요. 이번 달엔 같이 지출을 점검해볼까요?",
        )
    if pct < GOAL_PACE_INFO_PCT:
        return Insight(
            "goal_pace", "warning", f"이번달 저축액이 목표 월 저축액의 {pct:.0f}%예요. 우리 조금만 더 힘내볼까요?"
        )
    return Insight(
        "goal_pace", "info", f"이번달 저축액이 목표 월 저축액의 {pct:.0f}% — 두 분 다 목표 페이스를 잘 지키고 있어요!"
    )


def savings_execution_insight(surplus: Decimal, actual_saved: Decimal | None) -> Insight | None:
    """Compares this month's theoretical surplus (income - expense) against the actual
    increase in savings/investment product balances (net-worth snapshot delta), to check
    whether leftover money was actually put away rather than left sitting in checking."""
    if actual_saved is None or surplus <= 0:
        return None
    pct = _pct(actual_saved, surplus)
    if pct < SAVINGS_EXECUTION_CRITICAL_PCT:
        return Insight(
            "savings_execution",
            "critical",
            f"이번달 남은 돈 {surplus:,.0f}원 중 실제로 저축·투자한 금액은 "
            f"{actual_saved:,.0f}원({pct:.0f}%)뿐이에요. 나머지는 계좌에 머물러 있어요.",
        )
    if pct < SAVINGS_EXECUTION_WARN_PCT:
        return Insight(
            "savings_execution",
            "warning",
            f"이번달 남은 돈 {surplus:,.0f}원 중 {actual_saved:,.0f}원({pct:.0f}%)만 저축·투자로 옮겨졌어요.",
        )
    return Insight(
        "savings_execution",
        "info",
        f"이번달 남은 돈의 {pct:.0f}%를 저축·투자로 옮겼어요. 두 분 다 잘하고 있어요!",
    )


def investable_surplus(totals: dict, actual_saved: Decimal | None) -> Decimal:
    """이번달 여유자금(수입-지출) 중 아직 저축·투자로 옮겨지지 않은 금액.
    savings_execution_insight와 같은 입력을 쓰는 자매 함수 — growlio 투자 유도 카드에 쓰인다."""
    surplus = totals["savings"]
    if actual_saved is None or surplus <= 0:
        return Decimal("0")
    return max(surplus - actual_saved, Decimal("0"))


def recommend_surplus_allocation(
    surplus: Decimal, emergency_fund_balance: Decimal | None, avg_monthly_fixed: Decimal
) -> dict:
    """이번달 투자 가능 여유자금(investable_surplus)을 비상금 보충분과 투자 가능분으로 나눈다.
    비상금이 emergency_fund_insight와 같은 기준(EMERGENCY_FUND_TARGET_MONTHS)에 못 미치면
    부족분을 여유자금에서 먼저 채우도록 제안하고, 남는 만큼만 투자 가능분으로 돌린다. 비상금
    잔액이 설정되지 않았거나 평균 고정지출을 알 수 없으면(커버리지 계산 불가) 전액 투자
    가능분으로 취급한다 — InvestSurplusCard가 "잉여자금을 growlio에 담으라"고 무조건 권하던
    기존 동작과의 하위호환."""
    if surplus <= 0:
        return {"emergency_fund_portion": Decimal("0"), "investable_portion": Decimal("0")}
    if emergency_fund_balance is None or avg_monthly_fixed <= 0:
        return {"emergency_fund_portion": Decimal("0"), "investable_portion": surplus}
    target_balance = avg_monthly_fixed * EMERGENCY_FUND_TARGET_MONTHS
    shortfall = max(target_balance - emergency_fund_balance, Decimal("0"))
    emergency_fund_portion = min(shortfall, surplus)
    return {"emergency_fund_portion": emergency_fund_portion, "investable_portion": surplus - emergency_fund_portion}


def emergency_fund_context(db: Session, month_start: date) -> tuple[Decimal | None, Decimal | None]:
    """비상금 잔액과 최근 3개월 평균 고정지출 — compute_insights와 compute_surplus_allocation이
    같은 달을 대상으로 함께 호출될 때(app/routers/dashboard.py) 각자 재조회하지 않고 공유할 수
    있도록 뽑아낸 조회 헬퍼. 등록된 비상금 상품이 없으면 (None, None)."""
    balance = savings_product_service.get_emergency_fund_balance(db)
    if not balance:
        return None, None
    trend = transaction_report_service.monthly_trend(db, months=3, anchor=month_start)
    avg_fixed = sum((Decimal(str(row["fixed"])) for row in trend), Decimal("0")) / len(trend)
    return balance, avg_fixed


def compute_surplus_allocation(
    db: Session,
    month_start: date,
    surplus: Decimal,
    fund_context: tuple[Decimal | None, Decimal | None] | None = None,
) -> dict:
    """recommend_surplus_allocation에 필요한 비상금 잔액/평균 고정지출을 조회해 넘겨주는
    DB-aware 래퍼. 호출부가 이미 emergency_fund_context를 조회해둔 경우 fund_context로 넘겨받아
    재조회를 피한다."""
    current_balance, avg_fixed = fund_context if fund_context is not None else emergency_fund_context(db, month_start)
    if current_balance is None:
        return recommend_surplus_allocation(surplus, None, Decimal("0"))
    return recommend_surplus_allocation(surplus, current_balance, avg_fixed)


def emergency_fund_insight(current_balance: Decimal | None, avg_monthly_fixed: Decimal) -> Insight | None:
    if current_balance is None or avg_monthly_fixed <= 0:
        return None
    months_covered = float(current_balance / avg_monthly_fixed)
    if months_covered < EMERGENCY_FUND_MIN_MONTHS:
        return Insight(
            "emergency_fund",
            "warning",
            f"비상금이 고정지출의 {months_covered:.1f}개월치입니다. 최소 {EMERGENCY_FUND_MIN_MONTHS}개월치를 목표로 해보세요.",
        )
    if months_covered < EMERGENCY_FUND_TARGET_MONTHS:
        return Insight(
            "emergency_fund",
            "info",
            f"비상금이 고정지출의 {months_covered:.1f}개월치입니다. {EMERGENCY_FUND_TARGET_MONTHS}개월치가 이상적이에요. 함께 조금씩 채워가요.",
        )
    return Insight(
        "emergency_fund", "info", f"비상금이 고정지출의 {months_covered:.1f}개월치로 충분합니다. 든든하게 잘 대비하고 있어요!"
    )


def savings_streak_months(trend: list[dict], target_monthly: Decimal) -> int:
    """trend는 오래된 달부터 정렬된 월별 income/expense 목록(transaction_report_service.monthly_trend
    출력). 가장 최근 달부터 거꾸로 훑으며 그 달의 저축액(income-expense)이 목표 월 저축액 이상이었던
    연속 개월 수를 센다 (게임화 위젯의 '연속 목표달성' 스트릭 배지용)."""
    if target_monthly <= 0:
        return 0
    streak = 0
    for row in reversed(trend):
        savings = row["income"] - row["expense"]
        if savings < target_monthly:
            break
        streak += 1
    return streak


def compute_insights(
    db: Session,
    year_month: str | None = None,
    *,
    totals: dict | None = None,
    breakdown: list[dict] | None = None,
    goals: list[FinancialGoal] | None = None,
    actual_saved: Decimal | None = None,
    fund_context: tuple[Decimal | None, Decimal | None] | None = None,
    thresholds: dict[str, float] | None = None,
    benchmark_rows: list[dict] | None = None,
) -> list[Insight]:
    """호출부가 이미 같은 기간의 totals/breakdown/goals/thresholds/benchmark_rows를 조회·계산해둔
    경우, 넘겨받아 재조회·재계산을 피한다."""
    year_month = year_month or year_month_str(date.today())
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)

    thresholds = thresholds if thresholds is not None else coaching_settings_service.get_thresholds(db)
    totals = totals if totals is not None else transaction_report_service.period_totals(db, start, end)
    breakdown = (
        breakdown if breakdown is not None else transaction_report_service.category_breakdown(db, start, end, "expense")
    )
    budget_rows = budget_service.budget_vs_actual(
        db, year_month, thresholds["budget_warn_pct"], thresholds["budget_critical_pct"]
    )
    trailing_avg = transaction_report_service.trailing_average_by_category(db, month_start, months=3)
    goal_rows = goals if goals is not None else goal_service.list_goals(db)
    goal_dicts = [{"monthly_saving_amount": g.monthly_saving_amount} for g in goal_rows]

    insights: list[Insight] = []
    actual_saved = actual_saved if actual_saved is not None else net_worth_service.savings_delta(db, year_month)
    for candidate in (
        savings_rate_insight(totals, thresholds["savings_rate_warn"], thresholds["savings_rate_critical"]),
        fixed_cost_ratio_insight(
            totals, thresholds["fixed_cost_ratio_warn"], thresholds["fixed_cost_ratio_critical"]
        ),
        discretionary_ratio_insight(totals, breakdown, thresholds["discretionary_ratio_warn"]),
        debt_ratio_insight(totals, breakdown, thresholds["debt_ratio_warn"]),
        goal_pace_insight(totals, goal_dicts),
        savings_execution_insight(totals["savings"], actual_saved),
    ):
        if candidate:
            insights.append(candidate)
    insights.extend(budget_overrun_insights(budget_rows))
    insights.extend(variable_spend_trend_insights(breakdown, trailing_avg))

    benchmark_rows = (
        benchmark_rows
        if benchmark_rows is not None
        else category_benchmark_rows(totals, breakdown, benchmark_pcts_from_thresholds(thresholds))
    )
    insights.extend(category_benchmark_insights(benchmark_rows)[:CATEGORY_BENCHMARK_TOP_N])

    current_balance, avg_fixed = fund_context if fund_context is not None else emergency_fund_context(db, month_start)
    if current_balance is not None:
        ef_insight = emergency_fund_insight(current_balance, avg_fixed)
        if ef_insight:
            insights.append(ef_insight)

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda i: severity_rank.get(i.severity, 3))
    return insights
