"""보험 점검 — 등록한 보험 계약(InsurancePolicy)을 규칙 기반으로 점검해 줄일 여지·확인할 일을 돌려준다.

규칙은 순수 함수(계약 목록·집계값 → InsuranceFinding)이고 DB를 읽는 건 `build_insurance_review` 하나뿐이다.
**해지를 권하지 않는다** — 보험은 해지 뒤 재가입이 어렵거나(나이·병력) 면책기간이 다시 시작되므로, 문구는 "비교·확인"
까지만 한다. 절감 추정은 확실한 것(실손 중복, 소득 대비 초과분)에만 붙이고 나머지는 0이다.

임계값(app/config.py settings):
  benchmark_insurance_warn_pct           — 보장성 보험료 ÷ 소득 경고 %(가구 조정값, 코칭 벤치마크와 공유)
  insurance_renewal_notice_days          — 갱신형 갱신일 며칠 전부터 알릴지
  auto_insurance_renewal_notice_days     — 자동차보험 갱신일 며칠 전부터 비교를 권할지
  insurance_payment_ending_months        — 납입 완료 몇 개월 전부터 알릴지
  insurance_unregistered_tolerance_pct   — 보험료 카테고리 실지출이 등록 계약 합보다 몇 % 넘게 많으면 미등록 계약을 의심할지
  insurance_over_coverage_tolerance_pct  — 정액 보장 합계가 적정 기준보다 몇 % 넘게 많으면 감액 후보로 볼지
  insurance_renewable_rider_share_pct    — 갱신형 특약이 계약 보험료의 몇 % 이상이면 알릴지
  적정 가입금액 기준은 insurance_target_service(부부가 설정에서 조정, 기본값 config.insurance_target_*)

특약(InsuranceRider)을 입력한 계약은 특약 단위로, 입력 안 한 계약은 계약 단위로만 본다(부부가 주요 특약만 점진적으로 입력).
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.insurance import INDEMNITY_COVERAGES, TARGETED_COVERAGES
from app.constants.severity import severity_rank
from app.models.category import Category
from app.models.insurance_policy import InsurancePolicy
from app.models.insurance_rider import InsuranceRider
from app.models.user import User
from app.services import (
    coaching_settings_service,
    insurance_service,
    insurance_target_service,
    spending_review_service,
    transaction_trend_service,
)
from app.utils.dates import shift_month, today_kst
from app.utils.money import format_won, whole_won

COVERAGE_LABELS = {
    "medical_indemnity": "실손의료비",
    "cancer": "암진단",
    "stroke": "뇌혈관",
    "heart": "심장",
    "surgery": "수술비",
    "hospitalization": "입원일당",
    "death": "사망",
    "disability": "상해후유장해",
    "driver": "운전자",
    "driver_legal": "운전자 벌금·합의·변호사비",
    "liability": "일상배상책임",
    "dental": "치아",
}


@dataclass
class InsuranceFinding:
    rule_code: str
    severity: str  # 'info' | 'warning' | 'critical'
    title: str
    detail: str
    estimated_monthly_saving: Decimal = Decimal("0")
    policy_ids: list[int] = field(default_factory=list)



def insured_key(policy: InsurancePolicy) -> str:
    """같은 사람의 계약끼리 묶는 키 — 부부는 user id, 그 밖(자녀 등)은 입력한 이름.
    이름이 비어 있으면 누구인지 모르므로 계약마다 따로 본다(서로 다른 사람의 실손을 중복으로 오탐하지 않게)."""
    if policy.insured_user_id is not None:
        return str(policy.insured_user_id)
    name = (policy.insured_name or "").strip()
    return f"name:{name}" if name else f"policy:{policy.id}"


def insured_label(policy: InsurancePolicy, user_names: dict[uuid.UUID, str]) -> str:
    if policy.insured_user_id is not None:
        return user_names.get(policy.insured_user_id, "알 수 없음")
    return (policy.insured_name or "").strip() or "피보험자 미지정"


def _by_insured(policies: list[InsurancePolicy]) -> dict[str, list[InsurancePolicy]]:
    groups: dict[str, list[InsurancePolicy]] = defaultdict(list)
    for policy in policies:
        groups[insured_key(policy)].append(policy)
    return groups


# --- 규칙 -------------------------------------------------------------------------------------


def insurance_ratio_finding(protection_monthly: Decimal, avg_income: Decimal, warn_pct: float) -> InsuranceFinding | None:
    """보장성(저축성 제외) 월 보험료가 소득의 warn_pct%를 넘으면 초과분을 절감 추정으로. 같으면 내지 않는다."""
    if avg_income <= 0 or protection_monthly <= 0:
        return None
    guideline = avg_income * Decimal(str(warn_pct)) / 100
    excess = whole_won(protection_monthly - guideline)
    if excess <= 0:
        return None
    pct = float(protection_monthly / avg_income * 100)
    return InsuranceFinding(
        "insurance_ratio",
        "warning",
        f"보장성 보험료가 소득의 {pct:.1f}%예요 (가이드라인 {warn_pct:.0f}%)",
        f"월 {format_won(protection_monthly)} 중 {format_won(excess)}이 가이드라인을 넘어요. 겹치는 보장이나 특약부터 살펴보세요.",
        excess,
    )


@dataclass(frozen=True)
class _IndemnityUnit:
    """비례보상 보장 하나 — 실손 계약 전체이거나, 다른 계약 안의 비례보상 특약."""

    coverage: str
    label: str
    monthly_premium: Decimal
    policy_id: int


def indemnity_units(policy: InsurancePolicy) -> list[_IndemnityUnit]:
    """실손 계약은 계약 전체가 실손 1단위. 그 밖의 계약은 비례보상 특약마다 1단위 — 특약을 입력 안 했으면 보장 태그로
    단위를 만들되 보험료는 모른다(0). 그래서 중복은 잡히지만 절감 추정에는 아는 보험료만 들어간다."""
    if policy.policy_type == "indemnity":
        return [_IndemnityUnit("medical_indemnity", policy.name, policy.monthly_premium, policy.id)]
    if policy.riders:
        return [
            _IndemnityUnit(r.coverage, f"{policy.name} · {r.name}", r.monthly_premium, policy.id)
            for r in policy.riders
            if r.coverage in INDEMNITY_COVERAGES
        ]
    return [
        _IndemnityUnit(c, policy.name, Decimal("0"), policy.id)
        for c in dict.fromkeys(policy.coverages or [])
        if c in INDEMNITY_COVERAGES
    ]


_INDEMNITY_ADVICE = {
    "medical_indemnity": "실손은 중복 가입해도 실제 치료비 이상 받지 못해요. 가입 시기·보장을 비교해 하나만 남기는 걸 검토해 보세요. "
    "회사 단체실손이 있다면 개인실손 '중지' 제도도 확인해 보세요.",
    "liability": "일상배상책임은 실제 배상액을 계약끼리 나눠 보상해요. 가족형 하나면 가족 전체가 보장되는 경우가 많으니 "
    "가족 범위·한도를 확인하고 나머지 특약 해지를 검토해 보세요.",
    "driver_legal": "운전자 벌금·형사합의·변호사비는 실제 비용만큼 나눠 보상해요. 자동차보험 특약과 겹치는지도 확인하고 "
    "한 곳만 남기는 걸 검토해 보세요.",
}


def indemnity_duplicate_findings(
    policies: list[InsurancePolicy], user_names: dict[uuid.UUID, str]
) -> list[InsuranceFinding]:
    """같은 피보험자의 같은 비례보상 보장(실손·일상배상·운전자 비용)이 2단위 이상 — 여러 개여도 더 받지 않는다.
    어느 쪽을 남길지는 가입 시기·보장 범위에 달려 있어, 절감 추정은 보수적으로 "가장 비싼 1단위만 남김" 기준."""
    result = []
    for group in _by_insured(policies).values():
        by_coverage: dict[str, list[_IndemnityUnit]] = defaultdict(list)
        for policy in group:
            for unit in indemnity_units(policy):
                by_coverage[unit.coverage].append(unit)
        who = insured_label(group[0], user_names)
        for coverage, units in by_coverage.items():
            if len(units) < 2:
                continue
            premiums = [u.monthly_premium for u in units]
            saving = whole_won(sum(premiums, Decimal("0")) - max(premiums))
            if coverage == "medical_indemnity":
                title = f"{who}님 실손보험이 {len(units)}개예요"
            else:
                title = f"{who}님 {COVERAGE_LABELS[coverage]} 보장이 {len(units)}곳에 있어요"
            result.append(
                InsuranceFinding(
                    "indemnity_duplicate",
                    "critical",
                    title,
                    f"{', '.join(u.label for u in units)}. {_INDEMNITY_ADVICE[coverage]}",
                    saving,
                    sorted({u.policy_id for u in units}),
                )
            )
    return result


def _riders_by_coverage(group: list[InsurancePolicy]) -> dict[str, list[tuple[InsurancePolicy, InsuranceRider]]]:
    by_coverage: dict[str, list[tuple[InsurancePolicy, InsuranceRider]]] = defaultdict(list)
    for policy in group:
        for rider in policy.riders:
            if rider.coverage_amount and rider.coverage_amount > 0:
                by_coverage[rider.coverage].append((policy, rider))
    return by_coverage


def _amount_label(coverage: str, amount: Decimal) -> str:
    return f"1일 {format_won(amount)}" if coverage == "hospitalization" else format_won(amount)


def plan_reduction(
    riders: list[tuple[InsurancePolicy, InsuranceRider]], excess: Decimal
) -> list[tuple[InsurancePolicy, InsuranceRider, Decimal, Decimal]]:
    """초과분(excess)을 어느 특약에서 얼마씩 줄일지 — 갱신형을 먼저, 그다음 가입금액 대비 월 보험료가 비싼(효율 낮은)
    특약부터 깎는다. 반환: (계약, 특약, 감액 금액, 그만큼의 월 절감). 특약 일부만 감액하면 보험료도 비례해 준다고 본다."""
    ordered = sorted(
        riders,
        key=lambda pr: (not pr[1].is_renewable, -(pr[1].monthly_premium / pr[1].coverage_amount)),
    )
    plan = []
    remaining = excess
    for policy, rider in ordered:
        if remaining <= 0:
            break
        cut = min(remaining, rider.coverage_amount)
        plan.append((policy, rider, cut, whole_won(rider.monthly_premium * cut / rider.coverage_amount)))
        remaining -= cut
    return plan


def coverage_amount_findings(
    policies: list[InsurancePolicy],
    user_names: dict[uuid.UUID, str],
    targets: dict[str, Decimal],
    tolerance_pct: float,
) -> tuple[list[InsuranceFinding], list[dict]]:
    """정액 보장 합계를 적정 기준과 비교 — (점검 결과, 보장 현황표 행).
    합계 > 기준 × (1 + tolerance%)면 over_coverage(감액 시 월 절감 추정), 합계 < 기준이면 coverage_gap(줄이지 말 곳).
    특약을 하나도 입력 안 한 피보험자는 합계를 모르므로 건너뛴다."""
    findings: list[InsuranceFinding] = []
    table: list[dict] = []
    tolerance = 1 + Decimal(str(tolerance_pct)) / 100
    for group in _by_insured(policies).values():
        if not any(p.riders for p in group):
            continue
        who = insured_label(group[0], user_names)
        by_coverage = _riders_by_coverage(group)
        coverages = list(TARGETED_COVERAGES) + [
            c for c in by_coverage if c not in TARGETED_COVERAGES and c not in INDEMNITY_COVERAGES and c != "other"
        ]
        for coverage in coverages:
            riders = by_coverage.get(coverage, [])
            total = sum((r.coverage_amount for _, r in riders), Decimal("0"))
            target = targets.get(coverage, Decimal("0"))
            if not target:
                status = "no_target"
            elif total > target * tolerance:
                status = "over"
            elif total < target:
                status = "gap"
            else:
                status = "ok"
            # 이 보장 특약을 하나도 안 넣었으면 부족이 아니라 미입력일 가능성이 크다(주요 특약만 입력) — 표·점검에서 뺀다.
            if total == 0:
                continue
            table.append(
                {
                    "insured_label": who,
                    "coverage": coverage,
                    "total_amount": total,
                    "target_amount": target,
                    "status": status,
                    "rider_count": len(riders),
                }
            )
            label = COVERAGE_LABELS.get(coverage, coverage)
            if status == "over":
                plan = plan_reduction(riders, total - target)
                saving = sum((s for *_, s in plan), Decimal("0"))
                steps = ", ".join(f"{p.name} {r.name} {_amount_label(coverage, cut)} 감액" for p, r, cut, _ in plan)
                findings.append(
                    InsuranceFinding(
                        "over_coverage",
                        "warning",
                        f"{who}님 {label} 보장이 {_amount_label(coverage, total)}으로 기준({_amount_label(coverage, target)})보다 많아요",
                        f"기준까지 줄인다면 {steps}을 검토해 보세요(갱신형·보험료 대비 보장이 작은 특약 먼저). "
                        "특약 감액·해지가 되는지, 해약환급금은 얼마인지 보험사에 먼저 확인하세요.",
                        saving,
                        sorted({p.id for p, *_ in plan}),
                    )
                )
            elif status == "gap":
                findings.append(
                    InsuranceFinding(
                        "coverage_gap",
                        "info",
                        f"{who}님 {label} 보장은 {_amount_label(coverage, total)}으로 기준({_amount_label(coverage, target)})보다 적어요",
                        "보험료를 줄일 때 이 보장은 남겨 두세요. 입력하지 않은 특약이 있다면 추가하면 더 정확해져요.",
                        policy_ids=sorted({p.id for p, _ in riders}),
                    )
                )
    return findings, table


def renewable_rider_share_findings(policies: list[InsurancePolicy], share_pct: float) -> list[InsuranceFinding]:
    """갱신형 특약 월 보험료가 계약 월 보험료의 share_pct% 이상 — 갱신 때마다 오르는 몫이 크다."""
    result = []
    for policy in policies:
        renewable = sum((r.monthly_premium for r in policy.riders if r.is_renewable), Decimal("0"))
        if policy.monthly_premium <= 0 or renewable <= 0:
            continue
        share = float(renewable / policy.monthly_premium * 100)
        if share < share_pct:
            continue
        result.append(
            InsuranceFinding(
                "renewable_rider_share",
                "warning",
                f"{policy.name} 보험료의 {share:.0f}%가 갱신형 특약이에요",
                f"갱신형 특약 월 {format_won(renewable)}은 갱신 때마다 오를 수 있어요. 같은 보장의 비갱신형 특약·상품과 "
                "갱신 후 예상 보험료를 비교해 보세요.",
                policy_ids=[policy.id],
            )
        )
    return result


def rider_premium_mismatch_findings(policies: list[InsurancePolicy]) -> list[InsuranceFinding]:
    """입력한 특약 보험료 합이 계약 보험료보다 크면 입력 오류일 가능성이 크다."""
    return [
        InsuranceFinding(
            "rider_premium_mismatch",
            "info",
            f"{p.name} 특약 보험료 합이 계약 보험료보다 커요",
            f"특약 합 월 {format_won(p.riders_monthly_premium)} > 계약 월 {format_won(p.monthly_premium)}. 납입 주기나 금액을 확인해 주세요.",
            policy_ids=[p.id],
        )
        for p in policies
        if p.riders and p.riders_monthly_premium > p.monthly_premium
    ]


def top_riders(policies: list[InsurancePolicy], limit: int) -> list[dict]:
    rows = [
        {
            "policy_name": p.name,
            "rider_name": r.name,
            "coverage": r.coverage,
            "monthly_premium": r.monthly_premium,
            "is_renewable": r.is_renewable,
        }
        for p in policies
        for r in p.riders
        if r.monthly_premium > 0
    ]
    return sorted(rows, key=lambda row: row["monthly_premium"], reverse=True)[:limit]


def coverage_overlap_findings(
    policies: list[InsurancePolicy], user_names: dict[uuid.UUID, str]
) -> list[InsuranceFinding]:
    """같은 피보험자 + 같은 정액형 보장이 2건 이상. 정액형은 겹쳐도 각각 받으니 '필요 이상인지' 확인만 권한다.
    비례보상 보장(실손·일상배상·운전자 비용)의 중복은 indemnity_duplicate가 따로 본다."""
    result = []
    for group in _by_insured(policies).values():
        by_coverage: dict[str, list[InsurancePolicy]] = defaultdict(list)
        for policy in group:
            for coverage in dict.fromkeys(policy.coverages or []):
                if coverage not in INDEMNITY_COVERAGES:
                    by_coverage[coverage].append(policy)
        overlapping = {c: ps for c, ps in by_coverage.items() if len(ps) >= 2}
        if not overlapping:
            continue
        labels = ", ".join(f"{COVERAGE_LABELS.get(c, c)} {len(ps)}건" for c, ps in overlapping.items())
        ids = sorted({p.id for ps in overlapping.values() for p in ps})
        result.append(
            InsuranceFinding(
                "coverage_overlap",
                "info",
                f"{insured_label(group[0], user_names)}님 보장이 겹쳐요: {labels}",
                "정액형 보장은 겹치면 각각 받지만, 그만큼 보험료도 나가요. 필요한 보장 금액보다 많은지 확인해 보세요.",
                policy_ids=ids,
            )
        )
    return result


def renewal_findings(
    policies: list[InsurancePolicy], today: date, notice_days: int, auto_notice_days: int
) -> list[InsuranceFinding]:
    """갱신형(notice_days 이내)·자동차보험(auto_notice_days 이내) 갱신 임박. 지난 갱신일은 무시한다."""
    result = []
    for policy in policies:
        if not policy.is_renewable or policy.next_renewal_date is None:
            continue
        days_left = (policy.next_renewal_date - today).days
        if policy.policy_type == "auto":
            if 0 <= days_left <= auto_notice_days:
                result.append(
                    InsuranceFinding(
                        "auto_renewal_soon",
                        "info",
                        f"{policy.name} 갱신이 {days_left}일 남았어요",
                        "갱신 전에 다이렉트 보험 견적과 마일리지·블랙박스·자녀 할인 특약을 비교해 보세요.",
                        policy_ids=[policy.id],
                    )
                )
        elif 0 <= days_left <= notice_days:
            result.append(
                InsuranceFinding(
                    "renewal_soon",
                    "warning",
                    f"{policy.name} 갱신이 {days_left}일 남았어요",
                    "갱신형은 갱신 때 보험료가 오를 수 있어요. 갱신 보험료 안내를 받으면 같은 보장의 비갱신형과 비교해 보세요.",
                    policy_ids=[policy.id],
                )
            )
    return result


def savings_type_finding(policies: list[InsurancePolicy]) -> InsuranceFinding | None:
    """저축성·연금 보험 — 해지를 권하지 않는다(초기 해지 시 사업비 때문에 원금 손실)."""
    savings = [p for p in policies if p.policy_type == "savings"]
    if not savings:
        return None
    monthly = sum((p.monthly_premium for p in savings), Decimal("0"))
    return InsuranceFinding(
        "savings_type",
        "info",
        f"저축성 보험에 월 {format_won(monthly)}을 내고 있어요",
        "저축성 보험은 중도 해지하면 원금보다 적게 돌려받을 수 있어요. 부담되면 해지보다 감액·납입유예를 먼저 알아보고, "
        "새로 저축할 돈은 적금·연금저축과 수익률·세제 혜택을 비교해 보세요.",
        policy_ids=[p.id for p in savings],
    )


def payment_ending_findings(policies: list[InsurancePolicy], today: date, months: int) -> list[InsuranceFinding]:
    """납입 완료가 months개월 안에 오는 계약 — 그만큼 생길 월 여유를 저축으로 돌리자고 안내한다(절감 추정엔 넣지 않음)."""
    horizon = shift_month(today, months)
    result = []
    for policy in policies:
        end = policy.payment_end_date
        if end is None or end < today or end >= horizon:
            continue
        result.append(
            InsuranceFinding(
                "payment_ending",
                "info",
                f"{policy.name} 납입이 {end:%Y년 %m월}에 끝나요",
                f"그 뒤로 매달 {format_won(policy.monthly_premium)}이 생겨요. 저축·투자 계획에 미리 넣어 두면 흐지부지 쓰이지 않아요.",
                policy_ids=[policy.id],
            )
        )
    return result


def unregistered_premium_finding(
    actual_monthly: Decimal, registered_monthly: Decimal, tolerance_pct: float
) -> InsuranceFinding | None:
    """보험료 카테고리 실지출(월 평균)이 등록 계약 월 보험료 합보다 tolerance% 넘게 많으면 미등록 계약을 의심한다."""
    if actual_monthly <= 0 or actual_monthly <= registered_monthly * (1 + Decimal(str(tolerance_pct)) / 100):
        return None
    gap = whole_won(actual_monthly - registered_monthly)
    if registered_monthly <= 0:
        title = "보험 계약을 등록하면 점검해 드릴게요"
    else:
        title = f"등록 안 된 보험이 있을 수 있어요 (월 {format_won(gap)} 차이)"
    return InsuranceFinding(
        "unregistered_premium",
        "info",
        title,
        f"보험료 카테고리 지출은 월 평균 {format_won(actual_monthly)}인데 등록한 계약은 월 {format_won(registered_monthly)}이에요. "
        "자동차세처럼 보험이 아닌 지출이 같은 카테고리에 섞여 있다면 무시하셔도 돼요.",
    )


# --- DB-aware 래퍼 ----------------------------------------------------------------------------


def _insurance_category_monthly_avg(db: Session, today: date, categories: list[Category], months: int) -> Decimal:
    """보험료 카테고리의 직전 months개월(이번 달 제외) 월 평균 지출 — 연납·비정기 납입이 섞이므로 12개월로 본다.
    지출 기록이 있는 달로만 나눈다(쓰기 시작한 지 3개월이면 3으로)."""
    category_ids = {
        c.id for c in categories if spending_review_service.is_insurance_category(c.name, c.benchmark_group)
    }
    if not category_ids:
        return Decimal("0")
    averages = transaction_trend_service.trailing_average_by_category(
        db, today, months=months, type_="expense", active_months_only=True
    )
    return sum((avg for cat_id, avg in averages.items() if cat_id in category_ids), Decimal("0"))


def build_insurance_review(
    db: Session,
    *,
    today: date | None = None,
    thresholds: dict[str, float] | None = None,
    categories: list[Category] | None = None,
) -> dict:
    """thresholds·categories는 절감 점검이 소비 점검과 한 번만 읽어 넘긴다(없으면 여기서 조회)."""
    today = today or today_kst()
    categories = categories if categories is not None else db.query(Category).all()
    thresholds = thresholds if thresholds is not None else coaching_settings_service.get_thresholds(db)
    policies = insurance_service.list_policies(db)
    user_names = {u.id: u.display_name for u in db.query(User).all()}

    total_monthly = sum((p.monthly_premium for p in policies), Decimal("0"))
    savings_monthly = sum((p.monthly_premium for p in policies if p.policy_type == "savings"), Decimal("0"))
    protection_monthly = total_monthly - savings_monthly
    avg_income = transaction_trend_service.trailing_average_by_section(
        db, today, months=settings.insurance_income_lookback_months, active_months_only=True
    )[
        "income"
    ]

    findings: list[InsuranceFinding] = []
    ratio = insurance_ratio_finding(protection_monthly, avg_income, thresholds["benchmark_insurance_warn_pct"])
    duplicates = indemnity_duplicate_findings(policies, user_names)
    over_and_gap, coverage_table = coverage_amount_findings(
        policies, user_names, insurance_target_service.get_targets(db), settings.insurance_over_coverage_tolerance_pct
    )
    over = [f for f in over_and_gap if f.rule_code == "over_coverage"]
    findings += [f for f in (ratio,) if f] + duplicates + over_and_gap
    findings += renewable_rider_share_findings(policies, settings.insurance_renewable_rider_share_pct)
    findings += rider_premium_mismatch_findings(policies)
    findings += coverage_overlap_findings(policies, user_names)
    findings += renewal_findings(
        policies, today, settings.insurance_renewal_notice_days, settings.auto_insurance_renewal_notice_days
    )
    findings += [f for f in (savings_type_finding(policies),) if f]
    findings += payment_ending_findings(policies, today, settings.insurance_payment_ending_months)
    unregistered = unregistered_premium_finding(
        _insurance_category_monthly_avg(db, today, categories, settings.insurance_premium_lookback_months),
        total_monthly,
        settings.insurance_unregistered_tolerance_pct
    )
    if unregistered:
        findings.append(unregistered)

    findings.sort(key=lambda f: (severity_rank(f.severity), -f.estimated_monthly_saving))
    # 비례보상 중복과 정액 보장 과다는 서로 다른 보장이라 더해도 겹치지 않는다. 둘 다 소득 대비 초과분의 일부일 수
    # 있으므로 그것과는 겹쳐 세지 않고 큰 쪽만.
    estimated = max(
        ratio.estimated_monthly_saving if ratio else Decimal("0"),
        sum((f.estimated_monthly_saving for f in duplicates + over), Decimal("0")),
    )

    by_insured: dict[str, dict] = {}
    for policy in policies:
        entry = by_insured.setdefault(
            insured_key(policy), {"label": insured_label(policy, user_names), "monthly_premium": Decimal("0"), "count": 0}
        )
        entry["monthly_premium"] += policy.monthly_premium
        entry["count"] += 1

    return {
        "summary": {
            "policies_count": len(policies),
            "total_monthly_premium": total_monthly,
            "protection_monthly_premium": protection_monthly,
            "savings_monthly_premium": savings_monthly,
            "avg_monthly_income": avg_income,
            "protection_income_pct": float(protection_monthly / avg_income * 100) if avg_income > 0 else None,
            "guideline_pct": thresholds["benchmark_insurance_warn_pct"],
            "by_insured": sorted(by_insured.values(), key=lambda e: e["monthly_premium"], reverse=True),
            "coverage_table": coverage_table,
            "top_riders": top_riders(policies, settings.insurance_top_riders),
        },
        "findings": [
            {
                "rule_code": f.rule_code,
                "severity": f.severity,
                "title": f.title,
                "detail": f.detail,
                "estimated_monthly_saving": f.estimated_monthly_saving,
                "policy_ids": f.policy_ids,
            }
            for f in findings
        ],
        "total_estimated_monthly_saving": estimated,
    }
