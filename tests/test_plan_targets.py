from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services import plan_targets


@dataclass
class _Target:
    year_month: str
    target_amount: Decimal
    achieved_amount: Decimal = Decimal("0")


def test_elapsed_months_past_current_future_year():
    today = date(2026, 10, 6)
    assert plan_targets.elapsed_months(2025, today) == 12
    assert plan_targets.elapsed_months(2026, today) == 10
    assert plan_targets.elapsed_months(2027, today) == 0


def test_budget_status_inverts_only_for_income():
    # 지출: 많이 쓸수록 위험
    assert plan_targets.budget_status("variable", 85, warn_pct=80, critical_pct=100) == "warn"
    assert plan_targets.budget_status("fixed", 120, warn_pct=80, critical_pct=100) == "critical"
    # 수입: 덜 들어올수록 위험(미달분 100-pct로 판정)
    assert plan_targets.budget_status("income", 85, warn_pct=10, critical_pct=50) == "warn"
    assert plan_targets.budget_status("income", 120, warn_pct=10, critical_pct=50) == "ok"


def test_savings_status_treats_shortfall_as_risk():
    assert plan_targets.savings_status(100, warn_pct=10, critical_pct=50) == "ok"
    assert plan_targets.savings_status(40, warn_pct=10, critical_pct=50) == "critical"


def test_apply_monthly_targets_reuses_matching_rows_and_drops_missing_months():
    """같은 달 행은 인스턴스를 재사용해 target_amount만 바꾸고(achieved_amount 등 다른 컬럼 보존),
    새 달은 새로 만들고, 빠진 달은 목록에서 빠진다(delete-orphan)."""
    kept = _Target("2026-01", Decimal("100"), achieved_amount=Decimal("70"))
    parent = SimpleNamespace(monthly_targets=[kept, _Target("2026-02", Decimal("100"))])

    plan_targets.apply_monthly_targets(
        parent,
        [
            {"year_month": "2026-01", "target_amount": Decimal("150")},
            {"year_month": "2026-03", "target_amount": Decimal("200")},
        ],
        _Target,
    )

    assert [t.year_month for t in parent.monthly_targets] == ["2026-01", "2026-03"]
    assert parent.monthly_targets[0] is kept
    assert (kept.target_amount, kept.achieved_amount) == (Decimal("150"), Decimal("70"))
