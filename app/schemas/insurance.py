import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.schemas.common import KrwAmount, KrwBalance, bounded_str

PolicyType = Literal["indemnity", "diagnosis", "life", "accident", "auto", "home", "savings", "other"]
PaymentFrequency = Literal["monthly", "yearly"]
# 보장 태그 — 같은 피보험자의 보장 중복을 보려고 계약·특약마다 고른다. 비례보상(실손형)/정액형 분류는
# app/constants/insurance.py INDEMNITY_COVERAGES.
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
    "driver_legal",
    "liability",
    "dental",
]
# 특약은 태그에 없는 보장(골절·화상 등)도 많아 "other"를 허용한다.
RiderCoverage = Literal[Coverage, "other"]
MAX_RIDERS_PER_POLICY = 40

_POLICY_TYPES = frozenset(get_args(PolicyType))
_COVERAGES = frozenset(get_args(Coverage))


def _unknown_policy_type_to_other(v: object) -> object:
    if isinstance(v, str) and v not in _POLICY_TYPES:
        return "other"
    return v


def _unknown_coverage_to_other(v: object) -> object:
    if isinstance(v, str) and v not in _COVERAGES:
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
RiderCoverageOut = Annotated[RiderCoverage, BeforeValidator(_unknown_coverage_to_other)]


class InsuranceRiderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    coverage: RiderCoverageOut
    coverage_amount: Decimal | None
    premium: Decimal
    monthly_premium: Decimal
    is_renewable: bool
    end_date: date | None


class InsuranceRiderIn(BaseModel):
    """id가 있으면 그 특약을 갱신, 없으면 추가. 계약 저장 때 목록에 없는 기존 특약은 삭제된다."""

    id: int | None = None
    name: bounded_str(100)
    coverage: RiderCoverage
    coverage_amount: KrwBalance | None = None
    premium: KrwAmount = Decimal("0")
    is_renewable: bool = False
    end_date: date | None = None


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
    riders: list[InsuranceRiderOut]
    riders_monthly_premium: Decimal
    main_monthly_premium: Decimal
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
    # None이면 기존 특약을 그대로 둔다(특약을 모르는 구 클라이언트의 PUT이 특약을 지우지 않게). []이면 전부 삭제.
    riders: list[InsuranceRiderIn] | None = Field(default=None, max_length=MAX_RIDERS_PER_POLICY)
    recurring_expense_id: int | None = None
    memo: bounded_str(200) | None = None
