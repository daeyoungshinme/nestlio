import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.schemas.common import KrwAmount, bounded_str

PolicyType = Literal["indemnity", "diagnosis", "life", "accident", "auto", "home", "savings", "other"]
PaymentFrequency = Literal["monthly", "yearly"]
# 보장 태그 — 같은 피보험자의 보장 중복을 보려고 계약마다 고른다. 실손(medical_indemnity)만 비례보상이고 나머지는 정액형.
Coverage = Literal[
    "medical_indemnity",
    "cancer",
    "stroke",
    "heart",
    "surgery",
    "hospitalization",
    "death",
    "disability",
    "driver",
    "liability",
    "dental",
]

_POLICY_TYPES = frozenset(get_args(PolicyType))
_COVERAGES = frozenset(get_args(Coverage))


def _unknown_policy_type_to_other(v: object) -> object:
    if isinstance(v, str) and v not in _POLICY_TYPES:
        return "other"
    return v


def _drop_unknown_coverages(v: object) -> object:
    if isinstance(v, list):
        return [c for c in v if c in _COVERAGES]
    return [] if v is None else v


# 출력 전용 폴백(schemas/transaction.py PaymentMethodOut 패턴) — 컬럼은 자유텍스트/JSON이라 나중에 값을 줄여도
# 기존 행 때문에 응답 직렬화가 500으로 터지지 않게 한다. 입력은 순수 Literal로 엄격하게.
PolicyTypeOut = Annotated[PolicyType, BeforeValidator(_unknown_policy_type_to_other)]
CoveragesOut = Annotated[list[Coverage], BeforeValidator(_drop_unknown_coverages)]


class InsurancePolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    insurer: str | None
    policy_type: PolicyTypeOut
    insured_user_id: uuid.UUID | None
    insured_name: str | None
    premium_amount: Decimal
    payment_frequency: PaymentFrequency
    monthly_premium: Decimal
    is_renewable: bool
    next_renewal_date: date | None
    payment_end_date: date | None
    coverage_end_date: date | None
    coverages: CoveragesOut
    recurring_expense_id: int | None
    memo: str | None
    is_active: bool
    sort_order: int
    updated_at: datetime | None = None


class InsurancePolicyIn(BaseModel):
    """생성·수정 공용(PUT은 전체 교체)."""

    name: bounded_str(100)
    insurer: bounded_str(50) | None = None
    policy_type: PolicyType
    insured_user_id: uuid.UUID | None = None
    insured_name: bounded_str(30) | None = None
    premium_amount: KrwAmount
    payment_frequency: PaymentFrequency = "monthly"
    is_renewable: bool = False
    next_renewal_date: date | None = None
    payment_end_date: date | None = None
    coverage_end_date: date | None = None
    coverages: list[Coverage] = Field(default_factory=list, max_length=len(_COVERAGES))
    recurring_expense_id: int | None = None
    memo: bounded_str(200) | None = None
