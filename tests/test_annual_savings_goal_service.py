from datetime import date
from decimal import Decimal

from app.services import annual_savings_goal_service, transaction_service


def _even_targets(year: int, monthly: str) -> list[dict]:
    amount = Decimal(monthly)
    return [{"year_month": f"{year}-{month:02d}", "target_amount": amount} for month in range(1, 13)]


def test_upsert_creates_new_goal(seeded_db):
    db = seeded_db["db"]
    goal = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    assert goal.year == 2026
    assert goal.target_amount_krw == Decimal("12000000")
    assert goal.monthly_target_krw == Decimal("1000000")
    assert len(goal.monthly_targets) == 12


def test_upsert_updates_existing_year(seeded_db):
    db = seeded_db["db"]
    annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    updated = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1250000"))
    assert updated.target_amount_krw == Decimal("15000000")
    assert updated.monthly_target_krw == Decimal("1250000")
    assert len(annual_savings_goal_service.list_goals(db)) == 1


def test_upsert_preserves_uneven_monthly_amounts(seeded_db):
    db = seeded_db["db"]
    targets = _even_targets(2026, "1000000")
    targets[0]["target_amount"] = Decimal("2000000")  # 1월만 다르게
    goal = annual_savings_goal_service.upsert_goal(db, 2026, targets)
    assert goal.target_amount_krw == Decimal("13000000")
    jan = next(mt for mt in goal.monthly_targets if mt.year_month == "2026-01")
    assert jan.target_amount == Decimal("2000000")


def test_upsert_drops_months_missing_from_payload(seeded_db):
    db = seeded_db["db"]
    annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    updated = annual_savings_goal_service.upsert_goal(
        db, 2026, [{"year_month": "2026-01", "target_amount": Decimal("1000000")}]
    )
    assert len(updated.monthly_targets) == 1
    assert updated.target_amount_krw == Decimal("1000000")


def test_list_goals_orders_by_year_desc(seeded_db):
    db = seeded_db["db"]
    annual_savings_goal_service.upsert_goal(db, 2025, _even_targets(2025, "500000"))
    annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    years = [g.year for g in annual_savings_goal_service.list_goals(db)]
    assert years == [2026, 2025]


def test_get_goal_returns_none_when_missing(seeded_db):
    db = seeded_db["db"]
    assert annual_savings_goal_service.get_goal(db, 1999) is None


def test_delete_goal_removes_row(seeded_db):
    db = seeded_db["db"]
    annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    annual_savings_goal_service.delete_goal(db, 2026)
    assert annual_savings_goal_service.get_goal(db, 2026) is None


def test_delete_goal_is_noop_when_missing(seeded_db):
    db = seeded_db["db"]
    annual_savings_goal_service.delete_goal(db, 1999)  # should not raise


def test_compute_progress_for_current_year_uses_months_so_far(seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]
    goal = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 1, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), date(2026, 1, 20))
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 2, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("2000000"), date(2026, 2, 20))
    # 아직 오지 않은 3월 거래 — today가 2월이므로 진행률 계산에 포함되면 안 된다
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("9000000"), date(2026, 3, 1))

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 2, 28))

    assert progress["net_savings_ytd"] == Decimal("3000000")  # (3M-1M) + (3M-2M), 3월 제외
    assert progress["annual_achievement_pct"] == Decimal("3000000") / Decimal("12000000") * 100
    assert progress["current_month_savings"] == Decimal("1000000")  # 2월: 3M-2M
    assert progress["monthly_achievement_pct"] == Decimal("100")  # 1,000,000 / 1,000,000 * 100


def test_compute_progress_for_past_year_uses_all_12_months(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    goal = annual_savings_goal_service.upsert_goal(db, 2024, _even_targets(2024, "500000"))
    for month in range(1, 13):
        transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("500000"), date(2024, month, 10))

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 1, 1))

    assert progress["net_savings_ytd"] == Decimal("6000000")
    assert progress["annual_achievement_pct"] == Decimal("100")
    assert progress["current_month_savings"] == Decimal("0")  # 올해가 아니므로 이번달 실적 없음
    assert progress["monthly_achievement_pct"] is None


def test_compute_progress_for_future_year_is_all_zero(seeded_db):
    db = seeded_db["db"]
    goal = annual_savings_goal_service.upsert_goal(db, 2027, _even_targets(2027, "1000000"))

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 6, 1))

    assert progress["net_savings_ytd"] == Decimal("0")
    assert progress["annual_achievement_pct"] == Decimal("0")
    assert progress["current_month_savings"] == Decimal("0")
    assert progress["monthly_achievement_pct"] is None


def test_compute_progress_guards_against_zero_target(seeded_db):
    db = seeded_db["db"]
    goal = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "0"))

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 6, 1))

    assert progress["annual_achievement_pct"] == Decimal("0")
    assert progress["monthly_achievement_pct"] is None


def test_compute_progress_uses_evenly_distributed_monthly_target(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    goal = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))  # 균등분배 -> 월 1,000,000
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("1000000"), date(2026, 3, 10))

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 3, 15))

    assert progress["monthly_achievement_pct"] == Decimal("100")


def test_compute_progress_returns_none_when_current_month_missing_from_targets(seeded_db):
    db = seeded_db["db"]
    goal = annual_savings_goal_service.upsert_goal(
        db, 2026, [{"year_month": "2026-01", "target_amount": Decimal("1000000")}]
    )

    progress = annual_savings_goal_service.compute_progress(db, goal, today=date(2026, 3, 15))

    assert progress["monthly_achievement_pct"] is None


def test_suggested_targets_uses_trailing_3_month_average(seeded_db):
    db, user, salary, food = seeded_db["db"], seeded_db["user"], seeded_db["salary"], seeded_db["food"]
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 5, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), date(2026, 5, 20))
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 6, 15))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), date(2026, 6, 20))

    suggestion = annual_savings_goal_service.suggested_targets(db, today=date(2026, 8, 1))

    assert suggestion["suggested_monthly_target_krw"] == Decimal("1333333.333333333333333333333")
    assert suggestion["suggested_annual_target_krw"] == suggestion["suggested_monthly_target_krw"] * 12


def test_suggested_targets_available_without_saved_goal(seeded_db):
    db = seeded_db["db"]
    suggestion = annual_savings_goal_service.suggested_targets(db, today=date(2026, 8, 1))
    assert suggestion["suggested_monthly_target_krw"] == Decimal("0")
    assert suggestion["suggested_annual_target_krw"] == Decimal("0")


def test_to_out_merges_base_fields_and_progress(seeded_db):
    db = seeded_db["db"]
    goal = annual_savings_goal_service.upsert_goal(db, 2026, _even_targets(2026, "1000000"))

    out = annual_savings_goal_service.to_out(db, goal, today=date(2026, 1, 1))

    assert out["year"] == 2026
    assert out["target_amount_krw"] == Decimal("12000000")
    assert out["monthly_target_krw"] == Decimal("1000000")
    assert len(out["monthly_targets"]) == 12
    assert out["net_savings_ytd"] == Decimal("0")
    assert out["annual_achievement_pct"] == Decimal("0")
