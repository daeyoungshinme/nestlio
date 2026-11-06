"""부부 통합 목표(kind="combined") — 구성 저장, 목표금액 재계산, 현재금액 합산·겹침 차감."""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.combined_goal_member import CombinedGoalMember
from app.models.growlio_goal_snapshot import GrowlioGoalSnapshot
from app.models.savings_product import SavingsProduct
from app.models.user import User
from app.services import combined_goal_service, goal_progress_service, goal_service, notification_service
from app.services import growlio_goal_snapshot_service as snapshot_service

TODAY = date(2026, 11, 6)
NOW = datetime(2026, 11, 6, 9, 0)


@pytest.fixture()
def household(seeded_db):
    db, me = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    return db, me, spouse


def _snapshot(db, user, goal_amount="300000000", investable="120000000", monthly="1000000", configured=True):
    db.add(
        GrowlioGoalSnapshot(
            user_id=user.id,
            is_configured=configured,
            goal_amount=Decimal(goal_amount) if configured else None,
            investable_assets=Decimal(investable) if investable is not None and configured else None,
            monthly_deposit_amount=Decimal(monthly) if configured else None,
            synced_at=NOW,
        )
    )
    db.commit()


def _product(db, name, balance, owner=None, growlio_id=None, product_type="investment"):
    product = SavingsProduct(
        name=name,
        current_balance=Decimal(balance),
        monthly_saving_amount=Decimal("0"),
        owner_user_id=owner.id if owner else None,
        growlio_account_id=growlio_id,
        product_type=product_type,
    )
    db.add(product)
    db.commit()
    return product


def _goal(db, name="내집마련", required="400000000", current="0", products=(), monthly="500000", kind="goal"):
    return goal_service.create_goal(
        db,
        priority=1,
        name=name,
        target_age=None,
        required_amount=Decimal(required),
        monthly_saving_amount=Decimal(monthly),
        current_amount=Decimal(current),
        funding_sources=[{"type": "savings_product", "id": p.id} for p in products],
        kind=kind,
    )


def _combined(db, member_goals=(), users=()):
    return goal_service.create_goal(
        db,
        priority=1,
        name="우리 부부 통합 목표",
        target_age=None,
        required_amount=Decimal("1"),  # 무시되고 구성 합으로 다시 계산된다
        monthly_saving_amount=Decimal("0"),
        kind="combined",
        member_goal_ids=[g.id for g in member_goals],
        growlio_user_ids=[u.id for u in users],
    )


def test_sums_members_and_growlio_snapshots(household):
    db, me, spouse = household
    _snapshot(db, me)
    _snapshot(db, spouse, goal_amount="200000000", investable="50000000", monthly="500000")
    house = _goal(db, current="30000000")
    combined = _combined(db, [house], [me, spouse])

    assert combined.required_amount == Decimal("900000000")
    out = goal_progress_service.to_out(db, combined, TODAY)
    assert out["current_amount"] == Decimal("200000000")  # 3천 + 1.2억 + 5천
    assert out["planned_monthly_amount"] == Decimal("2000000")  # 50만 + 100만 + 50만
    assert out["overlap_amount"] == Decimal("0")
    assert [m["type"] for m in out["combined_members"]] == ["goal", "growlio", "growlio"]
    me_row = out["combined_members"][1]
    assert me_row["name"] == "Spouse 1의 growlio 투자목표"
    assert me_row["progress_pct"] == Decimal("40")
    assert me_row["synced_at"] == NOW


def test_overlap_subtracts_growlio_linked_investment_but_not_real_estate(household):
    """구성 목표의 자금원이 growlio 계좌를 가져온 투자 상품이면 그 잔액은 growlio 투자자산에 이미 들어 있다."""
    db, me, spouse = household
    _snapshot(db, me)
    etf = _product(db, "ETF", "20000000", owner=me, growlio_id="g-etf")
    apt = _product(db, "아파트", "500000000", owner=me, growlio_id="g-apt", product_type="real_estate")
    savings = _product(db, "적금", "10000000", owner=me)
    spouse_etf = _product(db, "배우자 ETF", "7000000", owner=spouse, growlio_id="g-sp")  # 배우자 growlio는 미포함
    house = _goal(db, required="1000000000", products=[etf, apt, savings, spouse_etf])
    combined = _combined(db, [house], [me])

    out = goal_progress_service.to_out(db, combined, TODAY)
    assert out["overlap_amount"] == Decimal("20000000")
    # 구성 목표 5.37억 + 내 growlio 1.2억 − 겹침 2천
    assert out["current_amount"] == Decimal("537000000") + Decimal("120000000") - Decimal("20000000")


def test_unsynced_or_unconfigured_growlio_member_is_left_out(household):
    db, me, spouse = household
    _snapshot(db, me, configured=False)
    house = _goal(db, required="100000000", current="10000000")
    combined = _combined(db, [house], [me, spouse])  # 배우자는 아직 저장 전

    assert combined.required_amount == Decimal("100000000")
    out = goal_progress_service.to_out(db, combined, TODAY)
    assert out["current_amount"] == Decimal("10000000")
    me_row, spouse_row = out["combined_members"][1:]
    assert me_row["current_amount"] is None and me_row["required_amount"] is None
    assert spouse_row["synced_at"] is None and spouse_row["growlio"] is None


def test_old_growlio_without_investable_counts_target_but_not_current(household):
    db, me, _ = household
    _snapshot(db, me, investable=None)
    combined = _combined(db, users=[me])
    assert combined.required_amount == Decimal("300000000")
    out = goal_progress_service.to_out(db, combined, TODAY)
    assert out["current_amount"] == Decimal("0")
    assert out["combined_members"][0]["required_amount"] == Decimal("300000000")


def test_only_one_combined_goal(household):
    db, me, _ = household
    _combined(db, users=[me])
    with pytest.raises(goal_service.CombinedGoalExistsError):
        _combined(db, users=[me])


@pytest.mark.parametrize("member_kind", ["challenge", "net_worth"])
def test_rejects_non_long_term_member_goals(household, member_kind):
    db, me, _ = household
    other = _goal(db, name="기타", kind=member_kind)
    with pytest.raises(combined_goal_service.InvalidCombinedMemberError):
        _combined(db, [other])


def test_rejects_empty_and_removed_user(household):
    db, me, spouse = household
    with pytest.raises(combined_goal_service.InvalidCombinedMemberError):
        _combined(db)
    spouse.removed_at = NOW
    db.commit()
    with pytest.raises(combined_goal_service.InvalidCombinedMemberError):
        _combined(db, users=[spouse])


def test_member_goal_update_and_delete_recompute_target(household):
    db, me, _ = household
    _snapshot(db, me)
    house = _goal(db, required="400000000")
    car = _goal(db, name="차", required="50000000")
    combined = _combined(db, [house, car], [me])
    assert combined.required_amount == Decimal("750000000")

    goal_service.update_goal(db, car.id, 1, "차", None, Decimal("60000000"), Decimal("0"))
    db.refresh(combined)
    assert combined.required_amount == Decimal("760000000")

    goal_service.delete_goal(db, house.id)
    db.refresh(combined)
    assert combined.required_amount == Decimal("360000000")
    assert [m.member_goal_id for m in combined.combined_members if m.member_goal_id] == [car.id]
    assert db.query(CombinedGoalMember).count() == 2


def test_update_changes_members_only_when_given(household):
    db, me, spouse = household
    house = _goal(db, required="100000000")
    combined = _combined(db, [house], [me])
    goal_service.update_goal(db, combined.id, 1, "통합", None, Decimal("0"), Decimal("0"))
    assert len(combined.combined_members) == 2
    goal_service.update_goal(
        db, combined.id, 1, "통합", None, Decimal("0"), Decimal("0"), member_goal_ids=[], growlio_user_ids=[spouse.id]
    )
    assert [m.growlio_user_id for m in combined.combined_members] == [spouse.id]
    assert combined.required_amount == Decimal("0")


def test_snapshot_refresh_recomputes_target(household):
    db, me, _ = household
    combined = _combined(db, users=[me])
    assert combined.required_amount == Decimal("0")
    payload = {"is_configured": True, "goal_amount": 500_000_000, "investable_assets_krw": 1}
    with patch("app.services.growlio_goal_snapshot_service.growlio_client.fetch_investment_goal", return_value=payload):
        snapshot_service.refresh_own(db, "tok", me.id, now=NOW)
    db.refresh(combined)
    assert combined.required_amount == Decimal("500000000")


def test_current_amounts_and_milestones_include_combined(household):
    db, me, _ = household
    _snapshot(db, me, goal_amount="100000000", investable="60000000")
    combined = _combined(db, users=[me])
    assert goal_progress_service.current_amounts(db, [combined]) == {combined.id: Decimal("60000000")}
    assert goal_progress_service.compute_current_amount(db, combined) == Decimal("60000000")
    with patch("app.services.notification_service.send_email_best_effort") as send:
        assert notification_service.check_all_goal_milestones(db, TODAY) == 1
    assert "현재 금액: 60,000,000원" in send.call_args.args[2]


def test_api_create_and_list_combined(client, seeded_db):
    db, me = seeded_db["db"], seeded_db["user"]
    _snapshot(db, me)
    goal = client.post("/api/v1/financial-goals", json={"name": "집", "required_amount": "100000000"}).json()
    resp = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "combined",
            "name": "통합",
            "member_goal_ids": [goal["id"]],
            "growlio_user_ids": [str(me.id)],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "combined"
    assert body["required_amount"] == "400000000.00"
    assert body["combined_members"][1]["growlio"]["investable_assets"] == "120000000.00"

    listed = {g["id"]: g for g in client.get("/api/v1/financial-goals").json()}
    assert listed[body["id"]]["current_amount"] == body["current_amount"]

    dup = client.post("/api/v1/financial-goals", json={"kind": "combined", "name": "또", "growlio_user_ids": [str(me.id)]})
    assert dup.status_code == 409


def test_api_rejects_combined_without_members(client):
    resp = client.post("/api/v1/financial-goals", json={"kind": "combined", "name": "빈"})
    assert resp.status_code == 400
