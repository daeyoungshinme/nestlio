"""goal_progress_service의 순수 계산 함수 — DB가 필요한 집계(to_out/list_out)는 test_goal_service.py와
API 테스트가 간접 검증한다."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services import goal_progress_service as gps

TODAY = date(2026, 10, 6)


def test_progress_pct_caps_at_100_and_handles_zero_target():
    assert gps.compute_progress_pct(Decimal("50"), Decimal("200")) == Decimal("25")
    assert gps.compute_progress_pct(Decimal("500"), Decimal("200")) == Decimal("100")
    assert gps.compute_progress_pct(Decimal("500"), Decimal("0")) == Decimal("0")


def test_linear_eta_rounds_partial_month_up():
    # 1000 남음 / 월 300 → 3.33개월 → 4개월 뒤
    assert gps.compute_eta_year_month(TODAY, Decimal("0"), Decimal("1000"), Decimal("300")) == "2027-02"
    assert gps.compute_eta_year_month(TODAY, Decimal("0"), Decimal("900"), Decimal("300")) == "2027-01"


def test_linear_eta_edge_cases():
    assert gps.compute_eta_year_month(TODAY, Decimal("1000"), Decimal("1000"), Decimal("0")) == "2026-10"
    assert gps.compute_eta_year_month(TODAY, Decimal("0"), Decimal("1000"), Decimal("0")) is None


def test_eta_with_return_is_never_later_than_linear_and_caps_projection():
    linear = gps.compute_eta_year_month(TODAY, Decimal("0"), Decimal("10000000"), Decimal("100000"))
    compounded = gps.compute_eta_with_return(
        TODAY, Decimal("0"), Decimal("10000000"), Decimal("100000"), Decimal("7")
    )
    assert compounded is not None and compounded <= linear
    assert gps.compute_eta_with_return(TODAY, Decimal("0"), Decimal("1000"), Decimal("100"), None) is None
    # 50년(600개월) 안에 못 닿으면 None — 비현실적인 먼 미래 날짜를 내지 않는다
    assert gps.compute_eta_with_return(TODAY, Decimal("0"), Decimal("10") ** 12, Decimal("1"), Decimal("1")) is None


def test_ahead_behind_months_sign():
    assert gps.compute_ahead_behind_months("2027-01", date(2027, 4, 30)) == 3  # 3개월 빠름
    assert gps.compute_ahead_behind_months("2027-06", date(2027, 4, 1)) == -2
    assert gps.compute_ahead_behind_months(None, date(2027, 4, 1)) is None


def test_suggested_monthly_amount():
    assert gps.compute_suggested_monthly_amount(Decimal("100"), Decimal("1300"), 4) == Decimal("300")
    assert gps.compute_suggested_monthly_amount(Decimal("2000"), Decimal("1300"), 4) == Decimal("0")
    assert gps.compute_suggested_monthly_amount(Decimal("0"), Decimal("1300"), 0) is None


def test_planned_monthly_uses_linked_product_plans_else_manual_amount():
    linked = SimpleNamespace(
        monthly_saving_amount=Decimal("999"),
        funding_sources=[SimpleNamespace(savings_product_id=1), SimpleNamespace(savings_product_id=None)],
    )
    manual = SimpleNamespace(monthly_saving_amount=Decimal("50000"), funding_sources=[])

    assert gps.planned_monthly_for_goal(linked, {1: Decimal("300000"), 2: Decimal("1")}) == Decimal("300000")
    assert gps.planned_monthly_for_goal(manual, {1: Decimal("300000")}) == Decimal("50000")


def test_effective_status_marks_overdue_active_challenge_expired():
    challenge = SimpleNamespace(kind="challenge", status="active", target_date=date(2026, 9, 30))
    assert gps.effective_status(challenge, TODAY) == "expired"
    assert gps.effective_status(SimpleNamespace(kind="goal", status="active", target_date=None), TODAY) is None
