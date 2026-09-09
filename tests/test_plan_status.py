"""app/utils/plan_status.py — 연간/이번달 계획 서비스가 공유하는 계획 대비 실적 임계값 헬퍼.

여러 서비스 테스트가 결과를 간접 검증하지만(tests/CLAUDE.md의 "전용 파일 없음" 목록),
경계값·폴백 분기가 여러 곳의 근거라 여기서 직접 못박는다.
"""
from decimal import Decimal

import pytest

from app.utils.plan_status import pct_of, status_from_pct


@pytest.mark.parametrize(
    "actual,planned,expected",
    [
        (Decimal("50"), Decimal("100"), 50.0),
        (Decimal("100"), Decimal("100"), 100.0),
        (Decimal("0"), Decimal("100"), 0.0),
        (Decimal("250"), Decimal("100"), 250.0),
    ],
)
def test_pct_of_basic_ratio(actual, planned, expected):
    assert pct_of(actual, planned) == expected


def test_pct_of_zero_planned_with_actual_counts_as_full():
    # "목표 없이 썼다/모았다"는 달성률 0%가 아니라 100%
    assert pct_of(Decimal("30000"), Decimal("0")) == 100.0


def test_pct_of_zero_planned_no_actual_uses_default():
    assert pct_of(Decimal("0"), Decimal("0")) == 0.0
    assert pct_of(Decimal("0"), Decimal("0"), zero_planned_default=None) is None


def test_pct_of_caps_at_cap():
    assert pct_of(Decimal("100000"), Decimal("1"), cap=999) == 999
    assert pct_of(Decimal("5"), Decimal("1"), cap=250) == 250


@pytest.mark.parametrize(
    "pct,expected",
    [(0, "ok"), (89.9, "ok"), (90, "warn"), (99.9, "warn"), (100, "critical"), (140, "critical")],
)
def test_status_from_pct_direct(pct, expected):
    # 지출/예산: 실적이 계획을 넘을수록 위험 (warn=90, critical=100)
    assert status_from_pct(pct, warn_pct=90, critical_pct=100) == expected


@pytest.mark.parametrize(
    "pct,expected",
    [(100, "ok"), (81, "ok"), (80, "warn"), (51, "warn"), (50, "critical"), (0, "critical")],
)
def test_status_from_pct_inverted(pct, expected):
    # 수입/저축·투자 계획: 실적이 계획에 못 미칠수록 위험 → 미달분(100-pct)을 임계값과 비교
    assert status_from_pct(pct, warn_pct=20, critical_pct=50, invert=True) == expected
