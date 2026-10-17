from decimal import Decimal

_WON = Decimal("1")


def whole_won(amount: Decimal) -> Decimal:
    """원화엔 소수점 단위가 없다 — 평균(합계/개월수)처럼 나눗셈으로 만든 금액을 원 단위로 반올림한다.
    소수가 남은 채로 제안값에 나가면 Numeric(12,2) 컬럼에 33333.33처럼 저장돼, 저장된 예산과 제안값이
    영원히 달라 "제안 적용" 박스가 사라지지 않는다."""
    return amount.quantize(_WON)


def monthly_equivalent(amount: Decimal, frequency: str, occurrences_per_month: int = 1) -> Decimal:
    """반복 금액(weekly/monthly/yearly)을 월 환산액으로. 월 여러 번(`days_of_month`)이면 occurrences_per_month로 곱한다."""
    if frequency == "weekly":
        return whole_won(amount * 52 / 12)
    if frequency == "yearly":
        return whole_won(amount / 12)
    return whole_won(amount * max(occurrences_per_month, 1))


def format_won(amount: Decimal | int) -> str:
    """메일·점검 문구용 "1,234원" — 원 단위로 반올림해 표시한다."""
    return f"{amount:,.0f}원"
