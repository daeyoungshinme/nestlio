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
