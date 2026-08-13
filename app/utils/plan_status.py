from typing import Literal

PlanStatus = Literal["ok", "warn", "critical"]


def pct_of(actual, planned, *, cap: float = 999, zero_planned_default: float | None = 0.0) -> float | None:
    """실적/계획 퍼센트를 계산한다. 계획이 0이면(아직 목표를 안 세운 상태) `zero_planned_default`로
    폴백하되, 실적이 있으면 100%로 본다 — "목표 없이 썼다/모았다"를 달성률 0%가 아니라 100%로 취급."""
    if planned:
        pct = float(actual / planned * 100)
    elif actual:
        pct = 100.0
    else:
        pct = zero_planned_default
    return min(pct, cap) if pct is not None else None


def status_from_pct(pct: float, warn_pct: float, critical_pct: float, *, invert: bool = False) -> PlanStatus:
    """`invert=True`는 실적이 계획에 못 미칠수록 위험한 경우(수입, 저축/투자 계획)에 쓴다 —
    미달분(100-pct)을 같은 임계값과 비교한다."""
    effective_pct = (100 - pct) if invert else pct
    if effective_pct >= critical_pct:
        return "critical"
    if effective_pct >= warn_pct:
        return "warn"
    return "ok"
