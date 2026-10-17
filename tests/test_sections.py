from typing import get_args

from app.constants.sections import EXPENSE_SECTIONS, SECTIONS
from app.schemas.cashflow_plan import CashflowSection


def test_section_constants_match_schema_literal():
    """서비스의 섹션 루프와 응답 스키마의 Literal이 어긋나면 새 섹션이 계산에서 조용히 빠진다."""
    assert set(get_args(CashflowSection)) == set(SECTIONS)
    assert SECTIONS == ("income", *EXPENSE_SECTIONS)
