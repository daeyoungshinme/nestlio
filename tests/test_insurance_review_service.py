import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.insurance_policy import InsurancePolicy
from app.models.insurance_rider import InsuranceRider
from app.services import insurance_review_service, insurance_service, transaction_service
from app.services.insurance_review_service import (
    coverage_amount_findings,
    coverage_overlap_findings,
    indemnity_duplicate_findings,
    insurance_ratio_finding,
    payment_ending_findings,
    plan_reduction,
    renewable_rider_share_findings,
    renewal_findings,
    rider_premium_mismatch_findings,
    savings_type_finding,
    top_riders,
    unregistered_premium_finding,
)

D = Decimal
TODAY = date(2026, 10, 15)
ME = uuid.uuid4()
NAMES = {ME: "대영"}


def _policy(id_, policy_type="diagnosis", premium="30000", insured=ME, insured_name=None, **kw):
    return InsurancePolicy(
        id=id_,
        name=kw.pop("name", f"보험{id_}"),
        policy_type=policy_type,
        premium_amount=D(premium),
        payment_frequency=kw.pop("payment_frequency", "monthly"),
        insured_user_id=insured,
        insured_name=insured_name,
        is_renewable=kw.pop("is_renewable", False),
        coverages=kw.pop("coverages", []),
        **kw,
    )


# --- insurance_ratio -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "protection,expected",
    [("400000", None), ("400001", "1"), ("500000", "100000")],  # 8% of 5,000,000 = 400,000
)
def test_insurance_ratio_boundaries(protection, expected):
    finding = insurance_ratio_finding(D(protection), D("5000000"), 8)
    if expected is None:
        assert finding is None
    else:
        assert finding.estimated_monthly_saving == D(expected)


def test_insurance_ratio_skips_without_income():
    assert insurance_ratio_finding(D("500000"), D("0"), 8) is None


# --- indemnity_duplicate ---------------------------------------------------------------------


def test_indemnity_duplicate_keeps_most_expensive_for_saving():
    policies = [
        _policy(1, "indemnity", "20000"),
        _policy(2, "indemnity", "35000"),
        _policy(3, "indemnity", "40000", insured=None, insured_name="아이"),  # 다른 사람
    ]
    [finding] = indemnity_duplicate_findings(policies, NAMES)
    assert finding.severity == "critical"
    assert finding.estimated_monthly_saving == D("20000")
    assert finding.policy_ids == [1, 2]
    assert "대영님" in finding.title


def test_indemnity_single_policy_is_fine():
    assert indemnity_duplicate_findings([_policy(1, "indemnity")], NAMES) == []


# --- coverage_overlap ------------------------------------------------------------------------


def test_coverage_overlap_ignores_indemnity_and_other_people():
    policies = [
        _policy(1, coverages=["cancer", "medical_indemnity"]),
        _policy(2, coverages=["cancer", "surgery"]),
        _policy(3, coverages=["medical_indemnity"]),
        _policy(4, insured=None, insured_name="아이", coverages=["surgery"]),
    ]
    [finding] = coverage_overlap_findings(policies, NAMES)
    assert "암진단 2건" in finding.title
    assert "수술비" not in finding.title
    assert finding.policy_ids == [1, 2]


# --- renewals --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "days,policy_type,expected",
    [
        (-1, "diagnosis", None),  # 지난 갱신일
        (0, "diagnosis", "renewal_soon"),
        (90, "diagnosis", "renewal_soon"),
        (91, "diagnosis", None),
        (45, "auto", "auto_renewal_soon"),
        (46, "auto", None),
    ],
)
def test_renewal_windows(days, policy_type, expected):
    policy = _policy(1, policy_type, is_renewable=True, next_renewal_date=TODAY + timedelta(days=days))
    findings = renewal_findings([policy], TODAY, 90, 45)
    assert [f.rule_code for f in findings] == ([expected] if expected else [])


def test_non_renewable_has_no_renewal_finding():
    policy = _policy(1, is_renewable=False, next_renewal_date=TODAY)
    assert renewal_findings([policy], TODAY, 90, 45) == []


# --- savings / payment ending / unregistered ------------------------------------------------


def test_savings_type_finding_has_no_saving_estimate():
    finding = savings_type_finding([_policy(1, "savings", "1200000", payment_frequency="yearly"), _policy(2)])
    assert finding.estimated_monthly_saving == 0
    assert "월 100,000원" in finding.title
    assert savings_type_finding([_policy(2)]) is None


@pytest.mark.parametrize(
    "end,flagged",
    [(date(2026, 10, 14), False), (date(2026, 10, 15), True), (date(2027, 9, 30), True), (date(2027, 10, 1), False)],
)
def test_payment_ending_window(end, flagged):
    findings = payment_ending_findings([_policy(1, payment_end_date=end)], TODAY, 12)
    assert bool(findings) is flagged


@pytest.mark.parametrize(
    "actual,registered,expected_title",
    [
        ("110000", "100000", None),  # exactly +10% tolerated
        ("110001", "100000", "등록 안 된 보험이 있을 수 있어요 (월 10,001원 차이)"),
        ("50000", "0", "보험 계약을 등록하면 점검해 드릴게요"),
        ("0", "0", None),
    ],
)
def test_unregistered_premium(actual, registered, expected_title):
    finding = unregistered_premium_finding(D(actual), D(registered), 10)
    assert (finding.title if finding else None) == expected_title


# --- build_insurance_review (DB) ------------------------------------------------------------


def _create(db, **overrides):
    fields = {
        "name": "실손",
        "insurer": None,
        "policy_type": "indemnity",
        "insured_user_id": None,
        "insured_name": None,
        "premium_amount": D("30000"),
        "payment_frequency": "monthly",
        "is_renewable": False,
        "next_renewal_date": None,
        "payment_end_date": None,
        "coverage_end_date": None,
        "coverages": [],
        "recurring_expense_id": None,
        "memo": None,
    }
    fields.update(overrides)
    return insurance_service.create_policy(db, fields)


def test_build_insurance_review_summary_and_total(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    for month in (7, 8, 9):
        transaction_service.create_transaction(db, user.id, salary.id, "income", D("1000000"), date(2026, month, 1))
    _create(db, name="실손A", insured_user_id=user.id, premium_amount=D("40000"))
    _create(db, name="실손B", insured_user_id=user.id, premium_amount=D("30000"))
    _create(db, name="연금보험", policy_type="savings", insured_user_id=user.id, premium_amount=D("100000"))

    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    summary = review["summary"]
    assert summary["policies_count"] == 3
    assert summary["protection_monthly_premium"] == D("70000")
    assert summary["savings_monthly_premium"] == D("100000")
    assert summary["protection_income_pct"] == pytest.approx(7.0)
    assert summary["by_insured"] == [{"label": "Spouse 1", "monthly_premium": D("170000"), "count": 3}]
    codes = [f["rule_code"] for f in review["findings"]]
    assert codes[0] == "indemnity_duplicate"  # critical 먼저
    assert "insurance_ratio" not in codes  # 7% < 8%
    assert review["total_estimated_monthly_saving"] == D("30000")


def test_build_insurance_review_flags_unregistered_from_category_spend(seeded_db):
    from app.models.category import Category

    db, user = seeded_db["db"], seeded_db["user"]
    insurance_cat = Category(name="보험료", type="fixed", color="#8b5cf6")
    db.add(insurance_cat)
    db.commit()
    for month in range(1, 13):
        ym_date = date(2025 + (month + 9 - 1) // 12, (month + 9 - 1) % 12 + 1, 25)  # 2025-10 ~ 2026-09
        transaction_service.create_transaction(db, user.id, insurance_cat.id, "expense", D("50000"), ym_date)

    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    assert [f["rule_code"] for f in review["findings"]] == ["unregistered_premium"]


def test_auto_policy_is_always_renewable(seeded_db):
    policy = _create(seeded_db["db"], policy_type="auto", is_renewable=False, next_renewal_date=date(2026, 11, 1))
    assert policy.is_renewable
    assert policy.next_renewal_date == date(2026, 11, 1)


# --- 특약 기반 규칙 ------------------------------------------------------------------------

TARGETS = {"cancer": D("30000000"), "stroke": D("20000000"), "heart": D("20000000"),
           "hospitalization": D("30000"), "death": D("0"), "disability": D("100000000")}


def _with_riders(id_, riders, premium="100000", **kw):
    policy = _policy(id_, kw.pop("policy_type", "diagnosis"), premium, **kw)
    policy.riders = [
        InsuranceRider(id=id_ * 100 + i, name=n, coverage=c, coverage_amount=D(a) if a else None, premium=D(p),
                       is_renewable=r, sort_order=i)
        for i, (n, c, a, p, r) in enumerate(riders)
    ]
    return policy


def test_indemnity_duplicate_counts_riders_inside_other_policies():
    standalone = _policy(1, "indemnity", "25000", name="실손보험")
    combo = _with_riders(2, [("질병실손", "medical_indemnity", None, "15000", True), ("암진단", "cancer", "30000000", "30000", False)])
    liability_a = _with_riders(3, [("일상배상", "liability", "100000000", "1000", False)], premium="50000")
    liability_b = _with_riders(4, [("가족일상배상", "liability", "100000000", "1500", False)], premium="60000")
    child = _with_riders(5, [("실손", "medical_indemnity", None, "9000", False)], insured=None, insured_name="아이")

    findings = indemnity_duplicate_findings([standalone, combo, liability_a, liability_b, child], NAMES)

    by_title = {f.title: f for f in findings}
    assert by_title["대영님 실손보험이 2개예요"].estimated_monthly_saving == D("15000")  # 25,000 남기고 15,000
    assert by_title["대영님 일상배상책임 보장이 2곳에 있어요"].estimated_monthly_saving == D("1000")
    assert len(findings) == 2  # 아이 실손 1건은 중복 아님


def test_indemnity_duplicate_from_tags_without_riders_has_unknown_saving():
    a = _policy(1, "accident", coverages=["driver_legal"])
    b = _policy(2, "auto", coverages=["driver_legal"])
    [finding] = indemnity_duplicate_findings([a, b], NAMES)
    assert finding.estimated_monthly_saving == 0


@pytest.mark.parametrize(
    "amounts,expected_status",
    [
        (["20000000"], "gap"),
        (["30000000"], "ok"),
        (["36000000"], "ok"),  # 기준 × 1.2 = 36,000,000 경계는 ok
        (["36000001"], "over"),
    ],
)
def test_coverage_status_tolerance_boundary(amounts, expected_status):
    policy = _with_riders(1, [(f"암{i}", "cancer", a, "30000", False) for i, a in enumerate(amounts)])
    _, table = coverage_amount_findings([policy], NAMES, TARGETS, 20)
    cancer = next(row for row in table if row["coverage"] == "cancer")
    assert cancer["status"] == expected_status


def test_plan_reduction_cuts_renewable_then_least_efficient_first():
    efficient = _with_riders(1, [("암A", "cancer", "30000000", "30000", False)])  # 1,000원/100만
    pricey = _with_riders(2, [("암B", "cancer", "20000000", "40000", False)])  # 2,000원/100만
    renewable = _with_riders(3, [("암C", "cancer", "10000000", "5000", True)])
    riders = [(p, r) for p in (efficient, pricey, renewable) for r in p.riders]

    plan = plan_reduction(riders, D("25000000"))

    assert [(r.name, cut, saving) for _, r, cut, saving in plan] == [
        ("암C", D("10000000"), D("5000")),  # 갱신형 먼저 전액
        ("암B", D("15000000"), D("30000")),  # 그다음 효율 낮은 특약 일부(40,000 × 15/20)
    ]


def test_over_coverage_finding_and_gap_skip_people_without_riders():
    mine = _with_riders(
        1,
        [
            ("암A", "cancer", "40000000", "40000", False),
            ("암B", "cancer", "20000000", "30000", True),
            ("뇌졸중", "stroke", "10000000", "10000", False),
        ],
    )
    child_no_riders = _policy(2, insured=None, insured_name="아이", coverages=["cancer"])

    findings, table = coverage_amount_findings([mine, child_no_riders], NAMES, TARGETS, 20)

    over = [f for f in findings if f.rule_code == "over_coverage"]
    assert len(over) == 1
    assert over[0].estimated_monthly_saving == D("30000") + D("10000")  # 암B(갱신형) 2,000만 전액 + 암A 1,000만/4,000만
    assert {row["insured_label"] for row in table} == {"대영"}
    gaps = {f.title for f in findings if f.rule_code == "coverage_gap"}
    assert gaps == {"대영님 뇌혈관 보장은 10,000,000원으로 기준(20,000,000원)보다 적어요"}
    # 특약을 하나도 넣지 않은 보장(심장·사망 등)은 미입력일 수 있어 표·점검에서 뺀다.
    assert {row["coverage"] for row in table} == {"cancer", "stroke"}


@pytest.mark.parametrize("renewable_premium,flagged", [("49999", False), ("50000", True)])
def test_renewable_rider_share_boundary(renewable_premium, flagged):
    policy = _with_riders(1, [("갱신 암", "cancer", "10000000", renewable_premium, True)], premium="100000")
    assert bool(renewable_rider_share_findings([policy], 50)) is flagged


def test_rider_premium_mismatch_and_top_riders():
    policy = _with_riders(1, [("A", "cancer", "1", "70000", False), ("B", "stroke", "1", "40000", True)], premium="100000")
    assert [f.rule_code for f in rider_premium_mismatch_findings([policy])] == ["rider_premium_mismatch"]
    assert [r["rider_name"] for r in top_riders([policy], 5)] == ["A", "B"]


def test_build_review_total_adds_duplicates_and_over_coverage(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    def rider(name, coverage, amount, premium, renewable=False):
        return {"name": name, "coverage": coverage, "coverage_amount": D(amount) if amount else None,
                "premium": D(premium), "is_renewable": renewable, "end_date": None}

    _create(db, name="실손", insured_user_id=user.id, premium_amount=D("20000"))
    _create(db, name="종합", policy_type="diagnosis", insured_user_id=user.id, premium_amount=D("100000"),
            riders=[rider("질병실손", "medical_indemnity", None, "10000"), rider("암1", "cancer", "40000000", "40000"),
                    rider("암2", "cancer", "20000000", "20000")])

    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    codes = [f["rule_code"] for f in review["findings"]]
    assert "indemnity_duplicate" in codes and "over_coverage" in codes
    # 실손 중복 10,000 + 암 3,000만 초과분 감액(효율 같음 → 암1 4,000만 중 3,000만 = 30,000) = 40,000
    assert review["total_estimated_monthly_saving"] == D("40000")
    cancer_row = next(r for r in review["summary"]["coverage_table"] if r["coverage"] == "cancer")
    assert cancer_row["status"] == "over" and cancer_row["total_amount"] == D("60000000")
    assert review["summary"]["top_riders"][0]["rider_name"] == "암1"


def test_coverage_overlap_leaves_indemnity_types_to_duplicate_rule():
    a = _policy(1, coverages=["liability", "cancer"])
    b = _policy(2, coverages=["liability", "cancer"])
    [finding] = coverage_overlap_findings([a, b], NAMES)
    assert "암진단 2건" in finding.title
    assert "일상배상" not in finding.title


def test_unnamed_non_spouse_policies_are_not_grouped_as_one_person():
    a = _policy(1, "indemnity", insured=None, insured_name="  ")
    b = _policy(2, "indemnity", insured=None, insured_name=None)
    assert indemnity_duplicate_findings([a, b], NAMES) == []
    named = [_policy(3, "indemnity", insured=None, insured_name="아이"), _policy(4, "indemnity", insured=None, insured_name="아이 ")]
    assert [f.rule_code for f in indemnity_duplicate_findings(named, NAMES)] == ["indemnity_duplicate"]


def test_short_history_is_not_diluted(seeded_db):
    """기록한 지 3개월이면 12개월이 아니라 3개월로 나눈다 — 보험 카테고리 평균·소득 모두."""
    from app.models.category import Category

    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    insurance_cat = Category(name="보험료", type="fixed", color="#8b5cf6")
    db.add(insurance_cat)
    db.commit()
    for month in (8, 9):  # 소득은 3개월 창 중 2개월만, 보험료 지출은 12개월 창 중 2개월만
        transaction_service.create_transaction(db, user.id, salary.id, "income", D("2000000"), date(2026, month, 1))
        transaction_service.create_transaction(db, user.id, insurance_cat.id, "expense", D("90000"), date(2026, month, 25))
    _create(db, name="실손", insured_user_id=user.id, premium_amount=D("40000"))

    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    assert review["summary"]["avg_monthly_income"] == D("2000000")
    # 등록 4만 vs 실제 9만 → 미등록 경고(12로 나눴다면 1.5만이라 안 떴다)
    assert "unregistered_premium" in [f["rule_code"] for f in review["findings"]]


def test_zero_target_is_no_target_without_findings():
    policy = _with_riders(1, [("사망", "death", "50000000", "20000", False)])
    findings, table = coverage_amount_findings([policy], NAMES, TARGETS, 20)  # TARGETS["death"] == 0
    assert [row["status"] for row in table if row["coverage"] == "death"] == ["no_target"]
    assert findings == []


def test_yearly_policy_rider_monthly_premium():
    policy = _with_riders(1, [("암", "cancer", "30000000", "120000", False)], premium="240000", payment_frequency="yearly")
    assert policy.monthly_premium == D("20000")
    assert policy.riders[0].monthly_premium == D("10000")


def test_build_total_takes_ratio_when_larger_than_duplicates(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    for month in (7, 8, 9):
        transaction_service.create_transaction(db, user.id, salary.id, "income", D("1000000"), date(2026, month, 1))
    _create(db, name="실손A", insured_user_id=user.id, premium_amount=D("100000"))
    _create(db, name="실손B", insured_user_id=user.id, premium_amount=D("30000"))

    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    # 소득 100만의 8% = 8만 → 초과 5만 > 실손 중복 3만 — 큰 쪽만 센다.
    assert {f["rule_code"] for f in review["findings"]} >= {"insurance_ratio", "indemnity_duplicate"}
    assert review["total_estimated_monthly_saving"] == D("50000")


def test_build_uses_household_saved_targets(seeded_db):
    from app.services import insurance_target_service

    db, user = seeded_db["db"], seeded_db["user"]
    rider = {"name": "암", "coverage": "cancer", "coverage_amount": D("30000000"), "premium": D("30000")}
    _create(db, name="암보험", policy_type="diagnosis", insured_user_id=user.id, riders=[rider])

    assert "over_coverage" not in [f["rule_code"] for f in insurance_review_service.build_insurance_review(db, today=TODAY)["findings"]]
    insurance_target_service.set_targets(db, {"cancer": D("10000000")}, user.id)
    review = insurance_review_service.build_insurance_review(db, today=TODAY)

    assert "over_coverage" in [f["rule_code"] for f in review["findings"]]
    cancer = next(r for r in review["summary"]["coverage_table"] if r["coverage"] == "cancer")
    assert cancer["target_amount"] == D("10000000")


def test_coverage_labels_cover_every_coverage_tag():
    from typing import get_args

    from app.schemas.insurance import Coverage
    from app.services.insurance_review_service import COVERAGE_LABELS

    assert set(COVERAGE_LABELS) == set(get_args(Coverage))
