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
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import Category
from app.models.insurance_policy import InsurancePolicy
from app.models.user import User
from app.services import (
    coaching_settings_service,
    insurance_service,
    spending_review_service,
    transaction_report_service,
    transaction_trend_service,
)
from app.utils.dates import month_bounds, shift_month, today_kst
from app.utils.money import whole_won

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


def _won(amount: Decimal) -> str:
    return f"{amount:,.0f}원"


def insured_key(policy: InsurancePolicy) -> str:
    """같은 사람의 계약끼리 묶는 키 — 부부는 user id, 그 밖(자녀 등)은 입력한 이름."""
    if policy.insured_user_id is not None:
        return str(policy.insured_user_id)
    return f"name:{(policy.insured_name or '').strip()}"


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
        f"월 {_won(protection_monthly)} 중 {_won(excess)}이 가이드라인을 넘어요. 겹치는 보장이나 특약부터 살펴보세요.",
        excess,
    )


def indemnity_duplicate_findings(
    policies: list[InsurancePolicy], user_names: dict[uuid.UUID, str]
) -> list[InsuranceFinding]:
    """같은 피보험자의 실손이 2건 이상 — 실손은 실제 치료비를 계약끼리 나눠 보상(비례보상)하므로 여러 개여도 더 받지 않는다.
    어느 쪽을 남길지는 가입 시기(세대)·보장 범위에 달려 있어, 절감 추정은 보수적으로 "가장 비싼 1건만 남김" 기준."""
    result = []
    for group in _by_insured(policies).values():
        indemnity = [p for p in group if p.policy_type == "indemnity"]
        if len(indemnity) < 2:
            continue
        premiums = [p.monthly_premium for p in indemnity]
        saving = whole_won(sum(premiums, Decimal("0")) - max(premiums))
        names = ", ".join(p.name for p in indemnity)
        result.append(
            InsuranceFinding(
                "indemnity_duplicate",
                "critical",
                f"{insured_label(indemnity[0], user_names)}님 실손보험이 {len(indemnity)}개예요",
                f"{names}. 실손은 중복 가입해도 실제 치료비 이상 받지 못해요. 가입 시기·보장을 비교해 하나만 남기는 걸 "
                "검토해 보세요. 회사 단체실손이 있다면 개인실손 '중지' 제도도 확인해 보세요.",
                saving,
                [p.id for p in indemnity],
            )
        )
    return result


def coverage_overlap_findings(
    policies: list[InsurancePolicy], user_names: dict[uuid.UUID, str]
) -> list[InsuranceFinding]:
    """같은 피보험자 + 같은 정액형 보장(실손 제외)이 2건 이상. 정액형은 겹쳐도 각각 받으니 '필요 이상인지' 확인만 권한다."""
    result = []
    for group in _by_insured(policies).values():
        by_coverage: dict[str, list[InsurancePolicy]] = defaultdict(list)
        for policy in group:
            for coverage in dict.fromkeys(policy.coverages or []):
                if coverage != "medical_indemnity":
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
        f"저축성 보험에 월 {_won(monthly)}을 내고 있어요",
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
                f"그 뒤로 매달 {_won(policy.monthly_premium)}이 생겨요. 저축·투자 계획에 미리 넣어 두면 흐지부지 쓰이지 않아요.",
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
        title = f"등록 안 된 보험이 있을 수 있어요 (월 {_won(gap)} 차이)"
    return InsuranceFinding(
        "unregistered_premium",
        "info",
        title,
        f"보험료 카테고리 지출은 월 평균 {_won(actual_monthly)}인데 등록한 계약은 월 {_won(registered_monthly)}이에요. "
        "자동차세처럼 보험이 아닌 지출이 같은 카테고리에 섞여 있다면 무시하셔도 돼요.",
    )


# --- DB-aware 래퍼 ----------------------------------------------------------------------------


def _insurance_category_monthly_avg(db: Session, today: date, months: int = 12) -> Decimal:
    """보험료 카테고리의 직전 months개월(이번 달 제외) 월 평균 지출 — 연납·비정기 납입이 섞이므로 12개월로 본다."""
    category_ids = [
        c.id for c in db.query(Category).all() if spending_review_service.is_insurance_category(c.name, c.benchmark_group)
    ]
    if not category_ids:
        return Decimal("0")
    start = shift_month(today, -months)
    end = month_bounds(shift_month(today, -1))[1]
    total = sum(
        (
            row["amount"]
            for row in transaction_report_service.category_breakdown(db, start, end, "expense")
            if row["category_id"] in category_ids
        ),
        Decimal("0"),
    )
    return whole_won(total / months)


def build_insurance_review(
    db: Session, *, today: date | None = None, thresholds: dict[str, float] | None = None
) -> dict:
    today = today or today_kst()
    thresholds = thresholds if thresholds is not None else coaching_settings_service.get_thresholds(db)
    policies = insurance_service.list_policies(db)
    user_names = {u.id: u.display_name for u in db.query(User).all()}

    total_monthly = sum((p.monthly_premium for p in policies), Decimal("0"))
    savings_monthly = sum((p.monthly_premium for p in policies if p.policy_type == "savings"), Decimal("0"))
    protection_monthly = total_monthly - savings_monthly
    avg_income = transaction_trend_service.trailing_average_by_section(db, today, months=3)["income"]

    findings: list[InsuranceFinding] = []
    ratio = insurance_ratio_finding(protection_monthly, avg_income, thresholds["benchmark_insurance_warn_pct"])
    duplicates = indemnity_duplicate_findings(policies, user_names)
    findings += [f for f in (ratio,) if f] + duplicates
    findings += coverage_overlap_findings(policies, user_names)
    findings += renewal_findings(
        policies, today, settings.insurance_renewal_notice_days, settings.auto_insurance_renewal_notice_days
    )
    findings += [f for f in (savings_type_finding(policies),) if f]
    findings += payment_ending_findings(policies, today, settings.insurance_payment_ending_months)
    unregistered = unregistered_premium_finding(
        _insurance_category_monthly_avg(db, today), total_monthly, settings.insurance_unregistered_tolerance_pct
    )
    if unregistered:
        findings.append(unregistered)

    rank = {"critical": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: (rank.get(f.severity, 3), -f.estimated_monthly_saving))
    # 실손 중복분은 소득 대비 초과분의 일부일 수 있다 — 겹쳐 세지 않고 큰 쪽만.
    estimated = max(
        ratio.estimated_monthly_saving if ratio else Decimal("0"),
        sum((f.estimated_monthly_saving for f in duplicates), Decimal("0")),
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
