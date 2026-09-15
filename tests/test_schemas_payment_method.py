"""DB의 transactions.payment_method는 여전히 자유텍스트 String(50)이라, 응답 스키마를
Literal로 좁힌 뒤에도 그 값들 외의 기존(레거시) 데이터가 있으면 직렬화가 실패해선 안 된다 —
PaymentMethodOut이 미지 값을 "other"로 안전하게 폴백하는지 검증한다."""
import pytest
from pydantic import TypeAdapter

from app.schemas.dashboard import PaymentMethodAmountOut
from app.schemas.transaction import PaymentMethodOut

_adapter = TypeAdapter(PaymentMethodOut | None)


@pytest.mark.parametrize("value", ["cash", "credit_card", "debit_card", "transfer", "other"])
def test_known_payment_method_passes_through(value):
    assert _adapter.validate_python(value) == value


def test_none_passes_through():
    assert _adapter.validate_python(None) is None


@pytest.mark.parametrize("value", ["계좌이체", "체크카드", "unknown", ""])
def test_legacy_or_unknown_value_falls_back_to_other(value):
    assert _adapter.validate_python(value) == "other"


def test_payment_method_amount_out_tolerates_legacy_value():
    row = PaymentMethodAmountOut(payment_method="계좌이체", amount=10000)
    assert row.payment_method == "other"
