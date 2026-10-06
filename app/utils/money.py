from decimal import Decimal

_WON = Decimal("1")


def whole_won(amount: Decimal) -> Decimal:
    """원화엔 소수점 단위가 없다 — 평균(합계/개월수)처럼 나눗셈으로 만든 금액을 원 단위로 반올림한다.
    소수가 남은 채로 제안값에 나가면 Numeric(12,2) 컬럼에 33333.33처럼 저장돼, 저장된 예산과 제안값이
    영원히 달라 "제안 적용" 박스가 사라지지 않는다."""
    return amount.quantize(_WON)
