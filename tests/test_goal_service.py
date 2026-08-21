from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.category import Category
from app.services import account_service, goal_service, loan_service, savings_product_service, transaction_service
from app.services.growlio_client import GrowlioNotConfiguredError


def test_create_goal_uses_manual_current_amount_when_unlinked(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db, 1, "내집마련", 40, Decimal("100000000"), Decimal("500000"), Decimal("1000000")
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("1000000")
    assert goal_service.funding_source_breakdown(db, goal) == []


def test_linked_goal_current_amount_follows_product_balance(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "내집마련",
        40,
        Decimal("100000000"),
        Decimal("500000"),
        current_amount=Decimal("999"),  # 연동 상태에서는 무시되고 상품 잔액이 쓰인다
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("3000000")
    assert [fs["name"] for fs in goal_service.funding_source_breakdown(db, goal)] == ["청약통장"]

    savings_product_service.adjust_balance(db, product.id, Decimal("500000"))
    db.refresh(goal)
    assert goal_service.compute_current_amount(db, goal) == Decimal("3500000")


def test_goal_linked_to_multiple_products_sums_their_balances(seeded_db):
    db = seeded_db["db"]
    product_a = savings_product_service.create_product(db, "남편 적금", Decimal("2000000"), Decimal("100000"))
    product_b = savings_product_service.create_product(db, "아내 적금", Decimal("1500000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[
            {"type": "savings_product", "id": product_a.id},
            {"type": "savings_product", "id": product_b.id},
        ],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("3500000")
    breakdown = goal_service.funding_source_breakdown(db, goal)
    assert {fs["id"] for fs in breakdown} == {product_a.id, product_b.id}
    assert {fs["name"] for fs in breakdown} == {"남편 적금", "아내 적금"}


def test_unlinking_goal_falls_back_to_manual_amount(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("2000000"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("2000000")

    updated = goal_service.update_goal(
        db,
        goal.id,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        current_amount=Decimal("1500000"),
        funding_sources=[],
    )
    assert goal_service.compute_current_amount(db, updated) == Decimal("1500000")
    assert goal_service.funding_source_breakdown(db, updated) == []


# --- 저축상품 월 계획액 동기화: 목표에 연동된 상품은 monthly_saving_amount를 목표에서 물려받는다 ---


def test_linking_savings_product_syncs_monthly_amount(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("50000"))
    goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    db.refresh(product)
    assert product.monthly_saving_amount == Decimal("200000")
    assert product.monthly_saving_amount_synced is True


def test_updating_goal_monthly_amount_resyncs_linked_product(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("50000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    goal_service.update_goal(
        db,
        goal.id,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("300000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    db.refresh(product)
    assert product.monthly_saving_amount == Decimal("300000")


def test_unlinking_savings_product_preserves_last_synced_amount(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("50000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    goal_service.update_goal(
        db, goal.id, 1, "여행자금", None, Decimal("5000000"), Decimal("200000"), funding_sources=[]
    )
    db.refresh(product)
    assert product.monthly_saving_amount == Decimal("200000")
    assert product.goal_funding_source is None


def test_linking_two_savings_products_to_one_goal_does_not_auto_sync_either(seeded_db):
    """부부가 각자 다른 상품으로 한 목표를 함께 모으는 경우 — 잔액 합산은 계속되지만, 목표의
    월 저축액을 어느 상품에 나눠줄지 모호하므로 두 상품 모두 기존 월 계획액을 그대로 유지한다."""
    db = seeded_db["db"]
    product_a = savings_product_service.create_product(db, "적금A", Decimal("0"), Decimal("30000"))
    product_b = savings_product_service.create_product(db, "적금B", Decimal("0"), Decimal("70000"))
    goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[
            {"type": "savings_product", "id": product_a.id},
            {"type": "savings_product", "id": product_b.id},
        ],
    )
    db.refresh(product_a)
    db.refresh(product_b)
    assert product_a.monthly_saving_amount == Decimal("30000")
    assert product_b.monthly_saving_amount == Decimal("70000")
    assert product_a.monthly_saving_amount_synced is False
    assert product_b.monthly_saving_amount_synced is False


def test_linking_savings_product_already_linked_to_another_goal_raises(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("50000"))
    goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    with pytest.raises(goal_service.DuplicateFundingSourceProductError):
        goal_service.create_goal(
            db,
            1,
            "내집마련",
            40,
            Decimal("100000000"),
            Decimal("500000"),
            funding_sources=[{"type": "savings_product", "id": product.id}],
        )


def test_linked_account_balance_is_added(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "생활비 통장", "bank", Decimal("1000000"))
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "account", "id": account.id}],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("1000000")


def test_linked_loan_balance_is_subtracted(seeded_db):
    db = seeded_db["db"]
    savings = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    loan = loan_service.create_loan(
        db, "전세대출", Decimal("1000000"), Decimal("50000"), None, None, None, None
    )
    goal = goal_service.create_goal(
        db,
        1,
        "내집마련",
        40,
        Decimal("100000000"),
        Decimal("500000"),
        funding_sources=[
            {"type": "savings_product", "id": savings.id},
            {"type": "loan", "id": loan.id},
        ],
    )
    assert goal_service.compute_current_amount(db, goal) == Decimal("2000000")
    breakdown = {fs["type"]: fs["amount"] for fs in goal_service.funding_source_breakdown(db, goal)}
    assert breakdown["loan"] == Decimal("-1000000")


def test_mixed_funding_sources_match_net_worth_scope(seeded_db):
    """계좌+저축상품 전체와 대출 전체를 연동하면 net_worth_service.compute_current와 같은 값이 나와야 한다."""
    from app.services import net_worth_service

    db = seeded_db["db"]
    account = account_service.create_account(db, "생활비 통장", "bank", Decimal("1000000"))
    savings = savings_product_service.create_product(db, "청약통장", Decimal("3000000"), Decimal("100000"))
    loan = loan_service.create_loan(db, "전세대출", Decimal("500000"), Decimal("50000"), None, None, None, None)

    goal = goal_service.create_goal(
        db,
        1,
        "순자산 목표",
        None,
        Decimal("100000000"),
        Decimal("0"),
        funding_sources=[
            {"type": "account", "id": account.id},
            {"type": "savings_product", "id": savings.id},
            {"type": "loan", "id": loan.id},
        ],
    )

    net_worth = net_worth_service.compute_current(db)
    assert goal_service.compute_current_amount(db, goal) == net_worth["net_worth"]


def test_compute_months_remaining_none_without_target_date():
    assert goal_service.compute_months_remaining(date(2026, 1, 1), None) is None


def test_compute_months_remaining_counts_whole_months():
    assert goal_service.compute_months_remaining(date(2026, 1, 15), date(2027, 7, 1)) == 18


def test_compute_months_remaining_clamps_to_zero_when_target_date_passed():
    assert goal_service.compute_months_remaining(date(2026, 6, 1), date(2026, 1, 1)) == 0


def test_compute_suggested_monthly_amount_none_when_no_months_remaining():
    assert goal_service.compute_suggested_monthly_amount(Decimal("0"), Decimal("1000000"), None) is None
    assert goal_service.compute_suggested_monthly_amount(Decimal("0"), Decimal("1000000"), 0) is None


def test_compute_suggested_monthly_amount_divides_remaining_by_months():
    result = goal_service.compute_suggested_monthly_amount(Decimal("200000"), Decimal("2000000"), 6)
    assert result == Decimal("300000")


def test_compute_suggested_monthly_amount_clamps_to_zero_when_already_met():
    result = goal_service.compute_suggested_monthly_amount(Decimal("3000000"), Decimal("2000000"), 6)
    assert result == Decimal("0")


def test_to_out_includes_derived_fields_when_target_date_set(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("1200000"),
        Decimal("0"),
        current_amount=Decimal("0"),
        target_date=date(2026, 7, 1),
    )
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["target_date"] == date(2026, 7, 1)
    assert out["months_remaining"] == 6
    assert out["suggested_monthly_amount"] == Decimal("200000")


def test_to_out_derived_fields_are_none_without_target_date(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "여행자금", None, Decimal("1200000"), Decimal("0"))
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["target_date"] is None
    assert out["months_remaining"] is None
    assert out["suggested_monthly_amount"] is None


# --- weighted_return_rate_pct: balance-weighted average of linked investment products' return -----

def test_weighted_return_rate_pct_none_without_linked_products(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "여행자금", None, Decimal("5000000"), Decimal("200000"))
    assert goal_service.compute_weighted_return_rate_pct(goal) is None


def test_weighted_return_rate_pct_ignores_savings_type_and_no_principal(seeded_db):
    db = seeded_db["db"]
    savings = savings_product_service.create_product(db, "적금", Decimal("1000000"), Decimal("100000"), "savings")
    no_principal = savings_product_service.create_product(
        db, "주식(원금 미입력)", Decimal("1000000"), Decimal("0"), "investment"
    )
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[
            {"type": "savings_product", "id": savings.id},
            {"type": "savings_product", "id": no_principal.id},
        ],
    )
    assert goal_service.compute_weighted_return_rate_pct(goal) is None


def test_weighted_return_rate_pct_averages_by_balance(seeded_db):
    db = seeded_db["db"]
    # 25% return, balance 1,000,000
    product_a = savings_product_service.create_product(
        db, "주식A", Decimal("1000000"), Decimal("0"), "investment", principal_amount=Decimal("800000")
    )
    # 100% return, balance 1,000,000 -> equal weight average with product_a = 62.5%
    product_b = savings_product_service.create_product(
        db, "주식B", Decimal("1000000"), Decimal("0"), "investment", principal_amount=Decimal("500000")
    )
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[
            {"type": "savings_product", "id": product_a.id},
            {"type": "savings_product", "id": product_b.id},
        ],
    )
    assert goal_service.compute_weighted_return_rate_pct(goal) == Decimal("62.5")


# --- compute_projected_months_with_growth: months to reach target with assumed compounding --------

def test_projected_months_with_growth_zero_when_already_met():
    result = goal_service.compute_projected_months_with_growth(
        Decimal("2000000"), Decimal("100000"), Decimal("1000000"), Decimal("10")
    )
    assert result == 0


def test_projected_months_with_growth_none_when_no_balance_and_no_contribution():
    result = goal_service.compute_projected_months_with_growth(
        Decimal("0"), Decimal("0"), Decimal("1000000"), Decimal("10")
    )
    assert result is None


def test_projected_months_with_growth_none_when_growth_alone_never_reaches_target():
    # no monthly contribution and 0% assumed return -> balance never moves
    result = goal_service.compute_projected_months_with_growth(
        Decimal("1000000"), Decimal("0"), Decimal("1340000"), Decimal("0")
    )
    assert result is None


def test_projected_months_with_growth_compounds_monthly():
    # 1,000,000 lump sum, 120%/yr (=10%/mo) assumed return, no contributions:
    # 1.1^3 * 1,000,000 = 1,331,000 (not yet) -> 1.1^4 * 1,000,000 = 1,464,100 (reached)
    result = goal_service.compute_projected_months_with_growth(
        Decimal("1000000"), Decimal("0"), Decimal("1340000"), Decimal("120")
    )
    assert result == 4


def test_to_out_includes_investment_projection_for_linked_investment_goal(seeded_db):
    db = seeded_db["db"]
    product = savings_product_service.create_product(
        db, "주식A", Decimal("1000000"), Decimal("0"), "investment", principal_amount=Decimal("800000")
    )
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("5000000"),
        Decimal("200000"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
    )
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["weighted_return_rate_pct"] == Decimal("25")
    assert out["projected_months_with_growth"] is not None


def test_to_out_investment_projection_is_none_without_investment_link(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "여행자금", None, Decimal("5000000"), Decimal("200000"))
    out = goal_service.to_out(db, goal, today=date(2026, 1, 1))
    assert out["weighted_return_rate_pct"] is None
    assert out["projected_months_with_growth"] is None


# --- fetch_growlio_goal_settings: proxy for growlio 투자목표 프리필 -----------------------------


def test_fetch_growlio_goal_settings_returns_growlio_response():
    payload = {"is_configured": True, "goal_amount": 100000000.0}
    with patch("app.services.goal_service.growlio_client.fetch_investment_goal", return_value=payload):
        result = goal_service.fetch_growlio_goal_settings("token")

    assert result == payload


def test_fetch_growlio_goal_settings_propagates_not_configured_error():
    with patch(
        "app.services.goal_service.growlio_client.fetch_investment_goal",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            goal_service.fetch_growlio_goal_settings("token")


# --- kind="challenge": 단기 부부 챌린지 (옛 Challenge 모델을 흡수) -------------------------------

NOW = datetime(2026, 8, 3, 12, 0, 0)


def _create_challenge(
    db, user, target=Decimal("300000"), start=date(2026, 8, 1), end=date(2026, 8, 31), current=Decimal("0")
):
    return goal_service.create_goal(
        db,
        1,
        "외식비 줄이기",
        None,
        target,
        Decimal("0"),
        current,
        target_date=end,
        kind="challenge",
        description="이번 달 외식비 30만원 이하로",
        start_date=start,
        created_by_id=user.id,
    )


def test_create_challenge_defaults_to_active(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user)

    assert challenge.kind == "challenge"
    assert challenge.status == "active"
    assert challenge.completed_at is None
    assert challenge.created_by_id == user.id


def test_regular_goal_has_no_effective_status(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(db, 1, "내집마련", 40, Decimal("100000000"), Decimal("500000"))
    assert goal_service.effective_status(goal) is None


def test_update_challenge_progress_below_target_stays_active(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user, target=Decimal("300000"))

    updated = goal_service.update_goal(
        db, challenge.id, 1, challenge.name, None, Decimal("300000"), Decimal("0"),
        current_amount=Decimal("150000"), target_date=challenge.target_date,
        start_date=challenge.start_date, now=NOW,
    )

    assert updated.status == "active"
    assert updated.completed_at is None
    assert goal_service.compute_progress_pct(Decimal("150000"), Decimal("300000")) == Decimal("50")


def test_update_challenge_progress_reaching_target_succeeds(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user, target=Decimal("300000"))

    updated = goal_service.update_goal(
        db, challenge.id, 1, challenge.name, None, Decimal("300000"), Decimal("0"),
        current_amount=Decimal("300000"), target_date=challenge.target_date,
        start_date=challenge.start_date, now=NOW,
    )

    assert updated.status == "succeeded"
    assert updated.completed_at == NOW


def test_challenge_effective_status_active_within_period(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user, start=date(2026, 8, 1), end=date(2026, 8, 31))
    assert goal_service.effective_status(challenge, today=date(2026, 8, 15)) == "active"


def test_challenge_effective_status_expired_after_end_date(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user, start=date(2026, 8, 1), end=date(2026, 8, 31))
    assert goal_service.effective_status(challenge, today=date(2026, 9, 1)) == "expired"


def test_challenge_effective_status_succeeded_ignores_end_date(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user, target=Decimal("100000"), start=date(2026, 8, 1), end=date(2026, 8, 31))
    goal_service.update_goal(
        db, challenge.id, 1, challenge.name, None, Decimal("100000"), Decimal("0"),
        current_amount=Decimal("100000"), target_date=challenge.target_date,
        start_date=challenge.start_date, now=NOW,
    )
    assert goal_service.effective_status(challenge, today=date(2026, 9, 1)) == "succeeded"


def test_delete_challenge(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create_challenge(db, user)

    goal_service.delete_goal(db, challenge.id)

    assert goal_service.get_goal(db, challenge.id) is None


def test_challenge_with_linked_funding_source_succeeds_when_balance_reaches_target(seeded_db):
    """버그 회귀 테스트: funding_sources 연동 챌린지는 manual_current_amount가 아니라
    compute_current_amount(연동 잔액 합) 기준으로 완료 판정해야 한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    product = savings_product_service.create_product(db, "챌린지 적금", Decimal("0"), Decimal("100000"))
    challenge = goal_service.create_goal(
        db, 1, "외식비 줄이기", None, Decimal("300000"), Decimal("0"),
        current_amount=Decimal("0"),  # 연동 상태에서는 무시됨
        funding_sources=[{"type": "savings_product", "id": product.id}],
        target_date=date(2026, 8, 31), kind="challenge",
        start_date=date(2026, 8, 1), created_by_id=user.id, now=NOW,
    )
    assert challenge.status == "active"  # 잔액 0원, 아직 미달성

    savings_product_service.adjust_balance(db, product.id, Decimal("300000"))
    db.refresh(challenge)

    updated = goal_service.update_goal(
        db, challenge.id, 1, challenge.name, None, Decimal("300000"), Decimal("0"),
        current_amount=Decimal("0"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
        target_date=challenge.target_date, start_date=challenge.start_date, now=NOW,
    )
    assert updated.status == "succeeded"
    assert updated.completed_at == NOW


def test_sync_challenge_statuses_transitions_challenge_without_save_event(seeded_db):
    """스케줄러 안전망: 목표를 수정하지 않아도(저장 이벤트 없이) 연동 잔액이 자연 증가해 목표액을
    넘긴 챌린지가 succeeded로 전환된다."""
    db, user = seeded_db["db"], seeded_db["user"]
    product = savings_product_service.create_product(db, "챌린지 적금", Decimal("0"), Decimal("100000"))
    challenge = goal_service.create_goal(
        db, 1, "외식비 줄이기", None, Decimal("300000"), Decimal("0"),
        funding_sources=[{"type": "savings_product", "id": product.id}],
        target_date=date(2026, 8, 31), kind="challenge",
        start_date=date(2026, 8, 1), created_by_id=user.id, now=NOW,
    )

    savings_product_service.adjust_balance(db, product.id, Decimal("300000"))
    # challenge 자체는 저장(update_goal)하지 않음 — sync_challenge_statuses만 호출

    transitioned = goal_service.sync_challenge_statuses(db, now=NOW)

    assert [g.id for g in transitioned] == [challenge.id]
    db.refresh(challenge)
    assert challenge.status == "succeeded"
    assert challenge.completed_at == NOW


def test_sync_challenge_statuses_ignores_challenge_below_target(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _create_challenge(db, user, target=Decimal("300000"), current=Decimal("100000"))
    assert goal_service.sync_challenge_statuses(db, now=NOW) == []


# --- kind="goal"의 월별 계획: 미연동은 월별 achieved 합, 연동은 거래내역 기반 자동계산 -----------------


def _create_unlinked_goal_with_monthly_targets(db, monthly_targets):
    return goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("300000"),
        Decimal("0"),
        target_date=date(2026, 11, 30),
        monthly_targets=monthly_targets,
    )


def test_update_monthly_target_achieved_marks_month_as_achieved_in_to_out(seeded_db):
    db = seeded_db["db"]
    goal = _create_unlinked_goal_with_monthly_targets(
        db, [{"year_month": "2026-09", "target_amount": Decimal("100000")}]
    )
    goal_service.update_monthly_target_achieved(db, goal.id, "2026-09", Decimal("100000"))
    db.refresh(goal)
    out = goal_service.to_out(db, goal, today=date(2026, 9, 1))
    assert out["current_amount"] == Decimal("100000")
    assert out["monthly_targets"] == [
        {
            "year_month": "2026-09",
            "target_amount": Decimal("100000"),
            "achieved_amount": Decimal("100000"),
            "is_achieved": True,
            "is_auto_computed": False,
        }
    ]


def test_update_monthly_target_achieved_raises_when_month_not_planned(seeded_db):
    db = seeded_db["db"]
    goal = _create_unlinked_goal_with_monthly_targets(
        db, [{"year_month": "2026-09", "target_amount": Decimal("100000")}]
    )
    with pytest.raises(goal_service.MonthlyTargetNotFoundError):
        goal_service.update_monthly_target_achieved(db, goal.id, "2026-12", Decimal("1000"))


def test_update_monthly_target_achieved_returns_none_when_goal_not_found(seeded_db):
    db = seeded_db["db"]
    assert goal_service.update_monthly_target_achieved(db, 999999, "2026-09", Decimal("1000")) is None


def test_update_goal_preserves_achieved_amount_for_kept_month_and_drops_removed_month(seeded_db):
    db = seeded_db["db"]
    goal = _create_unlinked_goal_with_monthly_targets(
        db,
        [
            {"year_month": "2026-09", "target_amount": Decimal("100000")},
            {"year_month": "2026-10", "target_amount": Decimal("150000")},
        ],
    )
    goal_service.update_monthly_target_achieved(db, goal.id, "2026-09", Decimal("80000"))
    db.refresh(goal)

    updated = goal_service.update_goal(
        db,
        goal.id,
        1,
        goal.name,
        None,
        goal.required_amount,
        Decimal("0"),
        target_date=goal.target_date,
        monthly_targets=[{"year_month": "2026-09", "target_amount": Decimal("120000")}],
    )

    assert [(mt.year_month, mt.target_amount, mt.achieved_amount) for mt in updated.monthly_targets] == [
        ("2026-09", Decimal("120000"), Decimal("80000")),
    ]


def test_unlinked_goal_current_amount_uses_monthly_targets_when_plan_exists(seeded_db):
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db,
        1,
        "여행자금",
        None,
        Decimal("300000"),
        Decimal("0"),
        target_date=date(2026, 10, 31),
        monthly_targets=[
            {"year_month": "2026-09", "target_amount": Decimal("150000")},
            {"year_month": "2026-10", "target_amount": Decimal("150000")},
        ],
    )
    # required_amount는 월별 계획 합계로 덮어쓰지 않고 요청값 그대로 유지된다.
    assert goal.required_amount == Decimal("300000")
    assert goal_service.compute_current_amount(db, goal) == Decimal("0")

    goal_service.update_monthly_target_achieved(db, goal.id, "2026-09", Decimal("100000"))
    db.refresh(goal)
    assert goal_service.compute_current_amount(db, goal) == Decimal("100000")


def test_unlinked_goal_without_monthly_targets_still_uses_manual_amount(seeded_db):
    """monthly_targets 기능 도입 전에 만든 기존 목표(월별 계획 없음)는 하위호환으로 계속
    manual_current_amount를 쓴다 — 회귀 방지."""
    db = seeded_db["db"]
    goal = goal_service.create_goal(
        db, 1, "내집마련", 40, Decimal("100000000"), Decimal("500000"), current_amount=Decimal("1000000")
    )
    assert goal.monthly_targets == []
    assert goal_service.compute_current_amount(db, goal) == Decimal("1000000")


def test_compute_linked_monthly_achieved_sums_account_transactions_by_income_expense(seeded_db):
    db, user, salary, food = seeded_db["db"], seeded_db["user"], seeded_db["salary"], seeded_db["food"]
    account = account_service.create_account(db, "입출금통장", "checking", Decimal("0"))
    goal = goal_service.create_goal(
        db,
        1,
        "비상금",
        None,
        Decimal("1000000"),
        Decimal("0"),
        target_date=date(2026, 9, 30),
        funding_sources=[{"type": "account", "id": account.id}],
        monthly_targets=[{"year_month": "2026-09", "target_amount": Decimal("500000")}],
    )
    transaction_service.create_transaction(
        db, user.id, salary.id, "income", Decimal("300000"), date(2026, 9, 5), account_id=account.id
    )
    transaction_service.create_transaction(
        db, user.id, food.id, "expense", Decimal("50000"), date(2026, 9, 10), account_id=account.id
    )
    # 이 계좌와 무관한 거래(다른 카테고리, account_id 없음)는 집계에서 제외된다.
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("999999"), date(2026, 9, 15))

    result = goal_service.compute_linked_monthly_achieved(db, goal, ["2026-09"])
    assert result == {"2026-09": Decimal("250000")}


def test_compute_linked_monthly_achieved_savings_product_deposits_always_add(seeded_db):
    """저축상품 연동 거래는 항상 type="expense"로 기록되지만(체크통장->상품 이체) 상품 잔액을
    늘리는 입금이므로 income/expense와 무관하게 항상 더해진다."""
    db, user = seeded_db["db"], seeded_db["user"]
    savings_category = Category(name="저축", type="variable", is_savings=True, sort_order=0)
    db.add(savings_category)
    db.commit()
    db.refresh(savings_category)

    product = savings_product_service.create_product(db, "청약통장", Decimal("0"), Decimal("100000"))
    goal = goal_service.create_goal(
        db,
        1,
        "내집마련",
        None,
        Decimal("1000000"),
        Decimal("0"),
        target_date=date(2026, 9, 30),
        funding_sources=[{"type": "savings_product", "id": product.id}],
        monthly_targets=[{"year_month": "2026-09", "target_amount": Decimal("100000")}],
    )
    transaction_service.create_transaction(
        db,
        user.id,
        savings_category.id,
        "expense",
        Decimal("100000"),
        date(2026, 9, 5),
        savings_product_id=product.id,
    )

    result = goal_service.compute_linked_monthly_achieved(db, goal, ["2026-09"])
    assert result == {"2026-09": Decimal("100000")}


def test_to_out_marks_linked_goal_monthly_targets_as_auto_computed(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    account = account_service.create_account(db, "입출금통장", "checking", Decimal("0"))
    goal = goal_service.create_goal(
        db,
        1,
        "비상금",
        None,
        Decimal("1000000"),
        Decimal("0"),
        target_date=date(2026, 9, 30),
        funding_sources=[{"type": "account", "id": account.id}],
        monthly_targets=[{"year_month": "2026-09", "target_amount": Decimal("500000")}],
    )
    transaction_service.create_transaction(
        db, user.id, salary.id, "income", Decimal("300000"), date(2026, 9, 5), account_id=account.id
    )
    db.refresh(goal)

    out = goal_service.to_out(db, goal, today=date(2026, 9, 1))
    assert out["monthly_targets"] == [
        {
            "year_month": "2026-09",
            "target_amount": Decimal("500000"),
            "achieved_amount": Decimal("300000"),
            "is_achieved": False,
            "is_auto_computed": True,
        }
    ]
