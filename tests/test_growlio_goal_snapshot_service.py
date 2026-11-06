"""growlio_goal_snapshot_service — 부부 각자의 growlio 투자목표 마지막 값."""

from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.financial_goal import FinancialGoal
from app.models.growlio_goal_snapshot import GrowlioGoalSnapshot
from app.models.user import User
from app.services import growlio_client
from app.services import growlio_goal_snapshot_service as svc

NOW = datetime(2026, 11, 6, 9, 0)
FETCH = "app.services.growlio_goal_snapshot_service.growlio_client.fetch_investment_goal"

PAYLOAD = {
    "is_configured": True,
    "goal_amount": 300_000_000.0,
    "goal_annual_return_pct": 6.0,
    "annual_deposit_goal": 12_000_000.0,
    "annual_dividend_goal": None,
    "monthly_deposit_amount": 1_000_000.0,
    "retirement_target_year": 2045,
    "investable_assets_krw": 120_000_000.4,
    "annual_deposit_current": 9_000_000.0,
    "estimated_annual_dividend": 1_500_000.0,
    "actual_return_pct": 7.256,
}


def _combined_goal(db):
    db.add(FinancialGoal(kind="combined", name="통합", required_amount=Decimal("0")))
    db.commit()


def test_refresh_own_inserts_then_updates(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(FETCH, return_value=PAYLOAD):
        snap = svc.refresh_own(db, "tok", user.id, now=NOW)
    assert snap.is_configured is True
    assert snap.goal_amount == Decimal("300000000.00")
    assert snap.investable_assets == Decimal("120000000.40")
    assert snap.actual_return_pct == Decimal("7.26")
    assert snap.retirement_target_year == 2045
    assert snap.annual_dividend_goal is None
    assert snap.synced_at == NOW

    later = NOW + timedelta(days=1)
    with patch(FETCH, return_value={**PAYLOAD, "investable_assets_krw": 130_000_000}):
        svc.refresh_own(db, "tok", user.id, now=later)
    rows = db.query(GrowlioGoalSnapshot).all()
    assert len(rows) == 1
    assert rows[0].investable_assets == Decimal("130000000.00")
    assert rows[0].synced_at == later


def test_old_growlio_response_without_progress_fields(seeded_db):
    """growlio가 진행 필드를 모르는 구버전이면 설정값만 저장한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(FETCH, return_value={"is_configured": True, "goal_amount": 100_000_000}):
        snap = svc.refresh_own(db, "tok", user.id, now=NOW)
    assert snap.goal_amount == Decimal("100000000.00")
    assert snap.investable_assets is None
    assert snap.monthly_deposit_amount is None


def test_unconfigured_clears_values(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(FETCH, return_value=PAYLOAD):
        svc.refresh_own(db, "tok", user.id, now=NOW)
    with patch(FETCH, return_value={"is_configured": False}):
        snap = svc.refresh_own(db, "tok", user.id, now=NOW)
    assert snap.is_configured is False
    assert snap.goal_amount is None
    assert snap.investable_assets is None


def test_out_of_range_values_are_clamped(seeded_db):
    """범위를 넘는 값은 Postgres에서 DataError(500)가 되므로 컬럼 범위로 자른다. NaN은 None."""
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(FETCH, return_value={**PAYLOAD, "actual_return_pct": 1e9, "investable_assets_krw": float("nan")}):
        snap = svc.refresh_own(db, "tok", user.id, now=NOW)
    assert snap.actual_return_pct == Decimal("999999.99")
    assert snap.investable_assets is None


def test_refresh_own_failure_keeps_previous_values(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(FETCH, return_value=PAYLOAD):
        svc.refresh_own(db, "tok", user.id, now=NOW)
    with (
        patch(FETCH, side_effect=growlio_client.GrowlioRequestError("down")),
        pytest.raises(growlio_client.GrowlioRequestError),
    ):
        svc.refresh_own(db, "tok", user.id, now=NOW + timedelta(days=1))
    snap = db.get(GrowlioGoalSnapshot, user.id)
    assert snap.investable_assets == Decimal("120000000.40")
    assert snap.synced_at == NOW


def test_refresh_if_stale_skips_without_combined_goal(seeded_db):
    with patch(FETCH) as fetch:
        svc.refresh_if_stale("tok", seeded_db["user"].id, now=NOW)
    fetch.assert_not_called()


def test_refresh_if_stale_fetches_when_missing_or_old(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _combined_goal(db)
    with patch(FETCH, return_value=PAYLOAD) as fetch, patch.object(db, "close"):
        svc.refresh_if_stale("tok", user.id, now=NOW)
        fetch.assert_called_once()
        # 방금 저장했으면 다시 부르지 않는다
        svc.refresh_if_stale("tok", user.id, now=NOW + svc.STALE_AFTER - timedelta(minutes=1))
        fetch.assert_called_once()
        svc.refresh_if_stale("tok", user.id, now=NOW + svc.STALE_AFTER + timedelta(minutes=1))
        assert fetch.call_count == 2


def test_refresh_if_stale_swallows_growlio_errors(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _combined_goal(db)
    with patch(FETCH, side_effect=growlio_client.GrowlioRequestError("down")), patch.object(db, "close"):
        svc.refresh_if_stale("tok", user.id, now=NOW)  # raise하지 않는다
    assert db.get(GrowlioGoalSnapshot, user.id) is None


def test_snapshots_by_user_excludes_removed_spouse(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2", removed_at=NOW)
    db.add(spouse)
    db.commit()
    db.add_all(
        [
            GrowlioGoalSnapshot(user_id=user.id, is_configured=True, synced_at=NOW),
            GrowlioGoalSnapshot(user_id=spouse.id, is_configured=True, synced_at=NOW),
        ]
    )
    db.commit()
    assert set(svc.snapshots_by_user(db)) == {user.id}


def test_refresh_endpoint_returns_own_snapshot(client, seeded_db):
    with patch(FETCH, return_value=PAYLOAD):
        resp = client.post("/api/v1/financial-goals/growlio-snapshot/refresh")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == str(seeded_db["user"].id)
    assert body["investable_assets"] == "120000000.40"


def test_refresh_endpoint_maps_growlio_errors(client):
    with patch(FETCH, side_effect=growlio_client.GrowlioNotConfiguredError("off")):
        resp = client.post("/api/v1/financial-goals/growlio-snapshot/refresh")
    assert resp.status_code == 501
