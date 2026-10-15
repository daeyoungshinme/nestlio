import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.insurance_policy import InsurancePolicy
from app.services import insurance_review_service, insurance_service, transaction_service
from app.services.insurance_review_service import (
    coverage_overlap_findings,
    indemnity_duplicate_findings,
    insurance_ratio_finding,
    payment_ending_findings,
    renewal_findings,
    savings_type_finding,
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
