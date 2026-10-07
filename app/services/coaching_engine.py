"""Rule-based (non-AI) financial coaching. Every function here is a pure calculation
over already-fetched numbers, so the thresholds can be exhaustively unit tested."""
from dataclasses import dataclass
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
    savings_coaching_service,
    savings_product_plan_service,
    transaction_report_service,
    transaction_trend_service,
)
from app.utils.dates import month_bounds, parse_year_month, today_kst, year_month_str

# 코칭 임계값은 app/config.py의 settings에 있다 (app/services/CLAUDE.md 컨벤션). 뜻:
#   emergency_fund_min/target_months — 비상금 런웨이(고정지출 기준 개월수)
#   goal_pace_critical/info_pct       — 실제 저축 vs 계획 월저축액의 % (savings_pace_basis, 100=info, 70미만=critical)
#   savings_execution_critical/warn_pct — 실제 순자산 저축 증가분 vs 이론적 잉여(수입-지출)의 %
#   variable_trend_flag_pct           — 변동지출이 최근 3개월 평균 대비 몇 %p 늘면 경고
#   category_benchmark_top_n          — compute_insights가 대시보드에 노출할 벤치마크 인사이트 개수


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
        if change_pct >= settings.variable_trend_flag_pct:
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
    compute_insights가 상위 settings.category_benchmark_top_n개만 대시보드 알림에 노출한다 — 전체 비교표는
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


def goal_pace_insight(actual: Decimal, target_monthly: Decimal) -> Insight | None:
    if target_monthly <= 0:
        return None
    pct = _pct(actual, target_monthly)
    if pct < settings.goal_pace_critical_pct:
        return Insight(
            "goal_pace",
            "critical",
            f"이번달 저축·투자가 계획한 월 저축액의 {pct:.0f}%예요. 목표 페이스에 많이 못 미쳤어요. 이번 달엔 같이 지출을 점검해볼까요?",
        )
    if pct < settings.goal_pace_info_pct:
        return Insight(
            "goal_pace", "warning", f"이번달 저축·투자가 계획한 월 저축액의 {pct:.0f}%예요. 우리 조금만 더 힘내볼까요?"
        )
    return Insight(
        "goal_pace", "info", f"이번달 저축·투자가 계획한 월 저축액의 {pct:.0f}% — 두 분 다 목표 페이스를 잘 지키고 있어요!"
    )


def savings_execution_insight(surplus: Decimal, actual_saved: Decimal | None) -> Insight | None:
    """Compares this month's theoretical surplus (income - expense) against the actual
    increase in savings/investment product balances (net-worth snapshot delta), to check
    whether leftover money was actually put away rather than left sitting in checking."""
    if actual_saved is None or surplus <= 0:
        return None
    pct = _pct(actual_saved, surplus)
    if pct < settings.savings_execution_critical_pct:
        return Insight(
            "savings_execution",
            "critical",
            f"이번달 남은 돈 {surplus:,.0f}원 중 실제로 저축·투자한 금액은 "
            f"{actual_saved:,.0f}원({pct:.0f}%)뿐이에요. 나머지는 계좌에 머물러 있어요.",
        )
    if pct < settings.savings_execution_warn_pct:
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


def emergency_fund_insight(current_balance: Decimal | None, avg_monthly_fixed: Decimal) -> Insight | None:
    if current_balance is None or avg_monthly_fixed <= 0:
        return None
    months_covered = float(current_balance / avg_monthly_fixed)
    if months_covered < settings.emergency_fund_min_months:
        return Insight(
            "emergency_fund",
            "warning",
            f"비상금이 고정지출의 {months_covered:.1f}개월치입니다. 최소 {settings.emergency_fund_min_months}개월치를 목표로 해보세요.",
        )
    if months_covered < settings.emergency_fund_target_months:
        return Insight(
            "emergency_fund",
            "info",
            f"비상금이 고정지출의 {months_covered:.1f}개월치입니다. {settings.emergency_fund_target_months}개월치가 이상적이에요. 함께 조금씩 채워가요.",
        )
    return Insight(
        "emergency_fund", "info", f"비상금이 고정지출의 {months_covered:.1f}개월치로 충분합니다. 든든하게 잘 대비하고 있어요!"
    )


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
    year_month = year_month or year_month_str(today_kst())
    month_start = parse_year_month(year_month)
    start, end = month_bounds(month_start)

    thresholds = thresholds if thresholds is not None else coaching_settings_service.get_thresholds(db)
    totals = totals if totals is not None else transaction_report_service.period_totals(db, start, end)
    breakdown = (
        breakdown if breakdown is not None else transaction_report_service.category_breakdown(db, start, end, "expense")
    )
    trailing_avg = transaction_trend_service.trailing_average_by_category(db, month_start, months=3)
    budget_rows = budget_service.budget_vs_actual(
        db, year_month, thresholds["budget_warn_pct"], thresholds["budget_critical_pct"], suggested=trailing_avg
    )
    goal_rows = goals if goals is not None else goal_service.list_goals(db)
    planned_savings, deposits = savings_product_plan_service.plan_totals_for_month(db, year_month)
    pace_actual, pace_target = savings_coaching_service.savings_pace_basis(
        planned_savings, deposits, savings_coaching_service.goals_monthly_total(goal_rows), totals["savings"]
    )

    insights: list[Insight] = []
    actual_saved = actual_saved if actual_saved is not None else net_worth_service.savings_delta(db, year_month)
    for candidate in (
        savings_rate_insight(totals, thresholds["savings_rate_warn"], thresholds["savings_rate_critical"]),
        fixed_cost_ratio_insight(
            totals, thresholds["fixed_cost_ratio_warn"], thresholds["fixed_cost_ratio_critical"]
        ),
        discretionary_ratio_insight(totals, breakdown, thresholds["discretionary_ratio_warn"]),
        debt_ratio_insight(totals, breakdown, thresholds["debt_ratio_warn"]),
        goal_pace_insight(pace_actual, pace_target),
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
    insights.extend(category_benchmark_insights(benchmark_rows)[:settings.category_benchmark_top_n])

    current_balance, avg_fixed = fund_context if fund_context is not None else savings_coaching_service.emergency_fund_context(db, month_start)
    if current_balance is not None:
        ef_insight = emergency_fund_insight(current_balance, avg_fixed)
        if ef_insight:
            insights.append(ef_insight)

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda i: severity_rank.get(i.severity, 3))
    return insights
