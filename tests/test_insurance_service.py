import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.insurance_policy import InsurancePolicy
from app.services import insurance_service


def _fields(**overrides):
    fields = {
        "name": "실손의료비",
        "insurer": "A손보",
        "policy_type": "indemnity",
        "insured_user_id": None,
        "insured_name": None,
        "premium_amount": Decimal("30000"),
        "payment_frequency": "monthly",
        "is_renewable": False,
        "next_renewal_date": None,
        "payment_end_date": None,
        "coverage_end_date": None,
        "coverages": ["medical_indemnity"],
        "recurring_expense_id": None,
        "memo": None,
    }
    fields.update(overrides)
    return fields


@pytest.mark.parametrize(
    "amount,frequency,expected",
    [("30000", "monthly", "30000"), ("1200000", "yearly", "100000"), ("100000", "yearly", "8333")],
)
def test_monthly_premium(amount, frequency, expected):
    policy = InsurancePolicy(premium_amount=Decimal(amount), payment_frequency=frequency)
    assert policy.monthly_premium == Decimal(expected)


def test_create_policy_normalizes_insured_name_and_renewal(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    policy = insurance_service.create_policy(
        db,
        _fields(insured_user_id=user.id, insured_name="무시됨", is_renewable=False, next_renewal_date=date(2027, 1, 1)),
    )
    assert policy.insured_name is None
    assert policy.next_renewal_date is None
    assert policy.coverages == ["medical_indemnity"]


def test_create_policy_rejects_unknown_refs(seeded_db):
    db = seeded_db["db"]
    with pytest.raises(insurance_service.LinkedRecurringNotFoundError):
        insurance_service.create_policy(db, _fields(recurring_expense_id=999))
    with pytest.raises(insurance_service.InsuredUserNotFoundError):
        insurance_service.create_policy(db, _fields(insured_user_id=uuid.uuid4()))


def test_update_and_deactivate_policy(seeded_db):
    db = seeded_db["db"]
    policy = insurance_service.create_policy(db, _fields(insured_name="아이"))
    updated = insurance_service.update_policy(db, policy.id, _fields(insured_name="아이", premium_amount=Decimal("25000")))
    assert updated.premium_amount == Decimal("25000")
    assert insurance_service.update_policy(db, 9999, _fields()) is None

    assert insurance_service.deactivate_policy(db, policy.id)
    assert insurance_service.list_policies(db) == []
    assert len(insurance_service.list_policies(db, active_only=False)) == 1
    assert not insurance_service.deactivate_policy(db, 9999)


def _rider(name, coverage, amount, premium, **kw):
    return {"name": name, "coverage": coverage, "coverage_amount": Decimal(amount) if amount else None,
            "premium": Decimal(premium), "is_renewable": kw.get("is_renewable", False), "end_date": None, **({"id": kw["id"]} if "id" in kw else {})}


def test_riders_replace_by_id_and_sync_coverages(seeded_db):
    db = seeded_db["db"]
    policy = insurance_service.create_policy(
        db,
        _fields(
            policy_type="diagnosis",
            premium_amount=Decimal("1200000"),
            payment_frequency="yearly",
            coverages=["dental"],
            riders=[_rider("암진단", "cancer", "30000000", "600000"), _rider("골절", "other", None, "120000")],
        ),
    )
    assert [r.name for r in policy.riders] == ["암진단", "골절"]
    assert policy.coverages == ["cancer"]  # 특약이 있으면 특약에서 만든다(other 제외)
    assert policy.riders[0].monthly_premium == Decimal("50000")  # 연납 600,000 / 12
    assert policy.main_monthly_premium == Decimal("40000")  # 100,000 - 50,000 - 10,000
    cancer_id = policy.riders[0].id

    updated = insurance_service.update_policy(
        db,
        policy.id,
        _fields(
            policy_type="diagnosis",
            premium_amount=Decimal("1200000"),
            payment_frequency="yearly",
            riders=[_rider("암진단(감액)", "cancer", "20000000", "400000", id=cancer_id), _rider("뇌졸중", "stroke", "20000000", "300000")],
        ),
    )
    assert [(r.id == cancer_id, r.name) for r in updated.riders] == [(True, "암진단(감액)"), (False, "뇌졸중")]
    assert updated.coverages == ["cancer", "stroke"]
    from app.models.insurance_rider import InsuranceRider

    assert db.query(InsuranceRider).count() == 2  # "골절"은 delete-orphan


def test_riders_none_keeps_existing_and_foreign_id_rejected(seeded_db):
    db = seeded_db["db"]
    policy = insurance_service.create_policy(db, _fields(riders=[_rider("실손", "medical_indemnity", None, "30000")]))
    kept = insurance_service.update_policy(db, policy.id, _fields(riders=None))
    assert len(kept.riders) == 1

    with pytest.raises(insurance_service.RiderNotFoundError):
        insurance_service.update_policy(db, policy.id, _fields(riders=[_rider("x", "other", None, "0", id=999)]))
