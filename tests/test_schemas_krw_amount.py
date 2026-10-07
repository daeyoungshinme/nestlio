"""빈 문자열 금액 입력(<input type=number>를 비우면 "")이 KrwAmount 필드에서 0으로
처리되는지 검증한다 — Decimal이었다면 422가 났을 케이스들."""
import re
import types
import typing
from decimal import Decimal

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas.account import AccountCreateIn, AccountUpdateIn
from app.schemas.cashflow_plan import CashflowPlanItemSplitIn, CashflowPlanItemUpsertIn
from app.schemas.financial_goal import FinancialGoalCreateIn, FinancialGoalUpdateIn
from app.schemas.loan import LoanCreateIn, LoanUpdateIn
from app.schemas.recurring import RecurringCreateIn
from app.schemas.savings_product import SavingsProductCreateIn, SavingsProductUpdateIn


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (AccountCreateIn, {"name": "통장", "account_type": "bank", "initial_balance": ""}, "initial_balance"),
        (AccountUpdateIn, {"name": "통장", "account_type": "bank", "current_balance": ""}, "current_balance"),
        (
            SavingsProductCreateIn,
            {"name": "적금", "current_balance": "", "monthly_saving_amount": "", "principal_amount": ""},
            "current_balance",
        ),
        (
            SavingsProductUpdateIn,
            {"name": "적금", "current_balance": "", "monthly_saving_amount": "", "product_type": "savings"},
            "monthly_saving_amount",
        ),
        (LoanCreateIn, {"name": "대출", "balance": "", "monthly_payment": ""}, "balance"),
        (
            LoanUpdateIn,
            {
                "name": "대출",
                "balance": "",
                "monthly_payment": "",
                "origination_year_month": None,
                "term_months": None,
                "interest_rate": None,
                "repayment_method": None,
            },
            "monthly_payment",
        ),
        (
            FinancialGoalCreateIn,
            {"name": "목표", "required_amount": "", "monthly_saving_amount": "", "current_amount": ""},
            "required_amount",
        ),
        (
            FinancialGoalUpdateIn,
            {"priority": 1, "name": "목표", "target_age": None, "required_amount": "", "monthly_saving_amount": ""},
            "monthly_saving_amount",
        ),
        (
            CashflowPlanItemUpsertIn,
            {"section": "fixed", "year_month": "2026-08", "name": "월세", "amount": ""},
            "amount",
        ),
        (
            CashflowPlanItemSplitIn,
            {"section": "fixed", "name": "가전", "total_amount": "", "start_year_month": "2026-08"},
            "total_amount",
        ),
        (
            RecurringCreateIn,
            {"name": "구독", "category_id": 1, "amount": "", "frequency": "monthly", "start_date": "2026-08-01"},
            "amount",
        ),
    ],
)
def test_blank_amount_becomes_zero(model, payload, field):
    parsed = model.model_validate(payload)
    assert getattr(parsed, field) == Decimal("0")


# --- 저장 컬럼 범위를 넘는 입력은 Postgres DataError(500) 대신 스키마에서 422로 막는다 ----------------
# 테스트용 SQLite는 Numeric 정밀도·String 길이를 무시해 DB 단에서는 이 회귀를 잡을 수 없다.


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        # Numeric(12, 2) — 정수부 10자리까지
        (CashflowPlanItemUpsertIn, {"section": "fixed", "year_month": "2026-08", "name": "월세", "amount": "10000000000"}),
        (RecurringCreateIn, {"name": "구독", "category_id": 1, "amount": "-1", "frequency": "monthly", "start_date": "2026-08-01"}),
        (CashflowPlanItemUpsertIn, {"section": "fixed", "year_month": "2026-08", "name": "월세", "amount": "1.005"}),
        # Numeric(14, 2) — 정수부 12자리까지
        (LoanCreateIn, {"name": "대출", "balance": "1000000000000"}),
        (SavingsProductCreateIn, {"name": "적금", "current_balance": "-1"}),
        (LoanCreateIn, {"name": "대출", "interest_rate": "1000"}),
        # String(N)
        (AccountCreateIn, {"name": "가" * 101, "account_type": "bank"}),
        (RecurringCreateIn, {"name": "가" * 151, "category_id": 1, "amount": "1", "frequency": "monthly", "start_date": "2026-08-01"}),
    ],
)
def test_out_of_column_range_input_is_rejected(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_column_range_upper_bounds_are_accepted():
    assert CashflowPlanItemUpsertIn.model_validate(
        {"section": "fixed", "year_month": "2026-08", "name": "가" * 100, "amount": "9999999999.99"}
    ).amount == Decimal("9999999999.99")
    assert LoanCreateIn.model_validate({"name": "대출", "balance": "999999999999.99"}).balance == Decimal("999999999999.99")


def test_account_balance_may_be_negative():
    # 마이너스통장·카드처럼 계좌 잔액은 음수가 정상이다.
    assert AccountUpdateIn.model_validate(
        {"name": "마이너스통장", "account_type": "bank", "current_balance": "-500000"}
    ).current_balance == Decimal("-500000")


def _input_models():
    import importlib
    import inspect
    import pkgutil

    import app.schemas as schemas_pkg

    for mod_info in pkgutil.iter_modules(schemas_pkg.__path__):
        mod = importlib.import_module(f"app.schemas.{mod_info.name}")
        for name, cls in inspect.getmembers(mod, inspect.isclass):
            if issubclass(cls, BaseModel) and cls.__module__ == mod.__name__ and name.endswith("In"):
                yield cls


def _leaves(tp, meta):
    """Optional/Union/list/Annotated를 풀어 (기본 타입, 누적 메타데이터) 쌍을 낸다."""
    origin = typing.get_origin(tp)
    if origin is typing.Annotated:
        base, *extra = typing.get_args(tp)
        yield from _leaves(base, [*meta, *extra])
    elif origin in (typing.Union, types.UnionType, list):
        for arg in typing.get_args(tp):
            yield from _leaves(arg, meta)
    else:
        yield tp, meta


_STR_BOUND = re.compile(r"max_length=\d|pattern='")
_DECIMAL_BOUND = re.compile(r"\blt=")

# 저장되지 않는 입력(시트 URL 등)이라 길이 상한이 필요 없는 필드.
_UNSTORED_STR_FIELDS = {("SheetImportIn", "sheet_url"), ("SheetImportIn", "spreadsheet_id"), ("SheetImportIn", "sheet_name")}


def test_every_input_decimal_and_str_field_is_bounded():
    """새 *In 스키마에 Decimal/str 필드를 추가할 때 KrwAmount·bounded_str 등을 잊지 않도록 하는 가드.
    Literal·패턴(YearMonth)으로 이미 값이 좁혀진 필드는 통과시킨다."""
    unbounded = []
    for cls in _input_models():
        for fname, field in cls.model_fields.items():
            for base, meta in _leaves(field.annotation, list(field.metadata)):
                bounds = repr(meta)
                if base is str and not _STR_BOUND.search(bounds) and (cls.__name__, fname) not in _UNSTORED_STR_FIELDS:
                    unbounded.append(f"{cls.__name__}.{fname}")
                if base is Decimal and not _DECIMAL_BOUND.search(bounds):
                    unbounded.append(f"{cls.__name__}.{fname}")
    assert unbounded == []
