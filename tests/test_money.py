from decimal import Decimal

import pytest

from app.constants.severity import severity_rank
from app.utils.money import format_won, whole_won


# 기본 Decimal 컨텍스트(ROUND_HALF_EVEN) — .5는 짝수 쪽으로. 바꾸면 저장된 제안값과 어긋나므로 고정해 둔다.
@pytest.mark.parametrize(
    "value,expected", [("1234.5", "1234"), ("1235.5", "1236"), ("1234.6", "1235"), ("33333.33", "33333")]
)
def test_whole_won_rounds_to_won(value, expected):
    assert whole_won(Decimal(value)) == Decimal(expected)


def test_format_won():
    assert format_won(Decimal("1234567.6")) == "1,234,568원"
    assert format_won(0) == "0원"


def test_severity_rank_orders_critical_first_unknown_last():
    assert sorted(["info", "bogus", "critical", "warning"], key=severity_rank) == ["critical", "warning", "info", "bogus"]
