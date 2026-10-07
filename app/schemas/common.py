import uuid
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints


def _blank_to_zero(v: object) -> object:
    if isinstance(v, str) and v.strip() == "":
        return "0"
    return v


# <input type="number">를 지워 "0원"을 의도한 경우 e.target.value는 ""가 되어 그대로 전송된다 —
# Decimal은 빈 문자열을 파싱할 수 없어 422가 나므로, 입력 폼의 금액 필드(*In 스키마)는 이 타입으로
# target_amount 등을 선언해 빈 문자열을 0으로 취급한다.
# 범위는 저장 컬럼 정밀도와 맞춘다 — Postgres는 Numeric 범위를 넘으면 DataError(500)를 내고 테스트용
# SQLite는 이를 무시해 테스트로는 잡히지 않으므로 스키마에서 422로 막는다. Numeric(p, 2)의 정수부는
# p-2자리라 max_digits(입력값의 총 자릿수)로는 못 막고("10000000000"은 11자리지만 Numeric(12,2) 초과)
# lt 경계로 막는다.
# - KrwAmount: Numeric(12, 2) 컬럼(거래·반복지출·월 목표·월 저축액 등), 음수 불가
# - KrwBalance: Numeric(14, 2) 컬럼(상품·대출 잔액, 목표 총액 등), 음수 불가
# - SignedKrwBalance: 계좌 잔액처럼 마이너스(마이너스통장 등)가 정상인 Numeric(14, 2) 값
_NUMERIC_12_2 = Decimal(10) ** 10
_NUMERIC_14_2 = Decimal(10) ** 12
KrwAmount = Annotated[Decimal, BeforeValidator(_blank_to_zero), Field(ge=0, lt=_NUMERIC_12_2, decimal_places=2)]
KrwBalance = Annotated[Decimal, BeforeValidator(_blank_to_zero), Field(ge=0, lt=_NUMERIC_14_2, decimal_places=2)]
SignedKrwBalance = Annotated[
    Decimal, BeforeValidator(_blank_to_zero), Field(gt=-_NUMERIC_14_2, lt=_NUMERIC_14_2, decimal_places=2)
]
# 연이율·기대수익률 같은 Numeric(5, 2) 퍼센트 값.
Pct = Annotated[Decimal, Field(gt=-1000, lt=1000, decimal_places=2)]


def bounded_str(max_length: int) -> Any:
    """String(N) 컬럼에 그대로 저장되는 입력 문자열 — 길이를 넘기면 Postgres가 DataError(500)를 낸다."""
    return Annotated[str, StringConstraints(max_length=max_length)]

# 'YYYY-MM' 입력 — 월 문자열은 String(7) 컬럼에 그대로 저장되고 문자열 min/max·동등 비교로 기간을 판정하므로
# "2026-9" 같은 값이 들어오면 조용히 어긋나고, 형식이 아예 틀리면 parse_year_month에서 500이 난다.
# 입력 스키마(*In)와 쿼리 파라미터에만 쓰고, 출력 스키마는 서버가 만든 값이라 str 그대로 둔다.
YearMonth = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class TotalsOut(BaseModel):
    income: Decimal
    expense: Decimal
    fixed: Decimal
    variable: Decimal
    irregular: Decimal
    savings: Decimal


class UserTotalsOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    income: Decimal
    expense: Decimal
    savings: Decimal


class OwnerTotalsOut(BaseModel):
    """UserTotalsOut과 달리 거래를 *기록한* 사람(user_id)이 아니라 거래가 실제로 *속한*
    사람(owner_user_id) 기준 집계 — owner_user_id가 없으면 부부 공통 지출이며 display_name은
    "공통"이 된다."""

    owner_user_id: uuid.UUID | None
    display_name: str
    income: Decimal
    expense: Decimal
    savings: Decimal
    savings_investment: Decimal


class CategoryAmountOut(BaseModel):
    category_id: int
    name: str
    color: str
    type: Literal["fixed", "variable", "irregular"]
    amount: Decimal


class CategoryBenchmarkRowOut(BaseModel):
    group: str
    label: str
    amount: Decimal
    pct: float
    benchmark_pct: float
    status: Literal["ok", "warn"]


class TrendRowOut(BaseModel):
    year_month: str
    income: Decimal
    expense: Decimal
    fixed: Decimal
    variable: Decimal
    irregular: Decimal
