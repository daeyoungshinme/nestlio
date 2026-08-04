from datetime import date
from decimal import Decimal

import pytest

from app.services import (
    cashflow_plan_service,
    coaching_engine,
    goal_service,
    net_worth_service,
    savings_product_service,
    transaction_service,
    user_setting_service,
)
from app.services.coaching_engine import (
    Insight,
    budget_overrun_insights,
    debt_ratio_insight,
    discretionary_ratio_insight,
    emergency_fund_insight,
    fixed_cost_ratio_insight,
    goal_pace_insight,
    savings_execution_insight,
    savings_rate_insight,
    savings_streak_months,
    variable_spend_trend_insights,
)


def _totals(income, expense, fixed, variable):
    income, expense, fixed, variable = map(Decimal, (income, expense, fixed, variable))
    return {"income": income, "expense": expense, "fixed": fixed, "variable": variable, "savings": income - expense}


# --- savings rate: <10% critical, 10-20% warning, >=20% info -------------------------------

@pytest.mark.parametrize(
    "income,expense,expected_severity",
    [
        (1_000_000, 950_000, "critical"),  # 5% savings
        (1_000_000, 900_000, "warning"),  # exactly 10% -> boundary is warning (not <10)
        (1_000_000, 895_000, "warning"),  # 10.5%
        (1_000_000, 800_000, "info"),  # exactly 20% -> boundary is info (not <20)
        (1_000_000, 700_000, "info"),  # 30%
    ],
)
def test_savings_rate_boundaries(income, expense, expected_severity):
    totals = _totals(income, expense, 0, expense)
    insight = savings_rate_insight(totals)
    assert insight.severity == expected_severity


def test_savings_rate_skips_when_no_income():
    assert savings_rate_insight(_totals(0, 0, 0, 0)) is None


# --- fixed cost ratio: >=50% critical, >=40% warning, else None ----------------------------

@pytest.mark.parametrize(
    "fixed,expected",
    [
        (390_000, None),
        (400_000, "warning"),  # exactly 40%
        (450_000, "warning"),
        (500_000, "critical"),  # exactly 50%
        (600_000, "critical"),
    ],
)
def test_fixed_cost_ratio_boundaries(fixed, expected):
    totals = _totals(1_000_000, fixed, fixed, 0)
    insight = fixed_cost_ratio_insight(totals)
    if expected is None:
        assert insight is None
    else:
        assert insight.severity == expected


def test_fixed_cost_ratio_ignores_irregular_spend():
    # 30% fixed (below warn) plus a large irregular expense should not push the ratio into warning/critical
    totals = {
        "income": Decimal("1000000"),
        "fixed": Decimal("300000"),
        "irregular": Decimal("900000"),
    }
    assert fixed_cost_ratio_insight(totals) is None


# --- budget overrun: mirrors budget_service status (90% warn / 100% critical) --------------

def test_budget_overrun_insights_filters_unbudgeted_and_under_threshold():
    rows = [
        {"name": "식비", "budget": Decimal("0"), "actual": Decimal("50000"), "pct": 100.0, "status": "warn"},
        {"name": "쇼핑", "budget": Decimal("100000"), "actual": Decimal("50000"), "pct": 50.0, "status": "ok"},
        {"name": "여가", "budget": Decimal("100000"), "actual": Decimal("95000"), "pct": 95.0, "status": "warn"},
        {"name": "교통", "budget": Decimal("100000"), "actual": Decimal("110000"), "pct": 110.0, "status": "critical"},
    ]
    insights = budget_overrun_insights(rows)
    names = {i.message.split()[0] for i in insights}
    assert names == {"여가", "교통"}
    severities = {i.rule_code: i.severity for i in insights}


# --- variable spend trend: +20% vs trailing 3-month average --------------------------------

def test_variable_spend_trend_flags_at_20_percent_increase():
    breakdown = [
        {"category_id": 1, "name": "식비", "type": "variable", "amount": Decimal("120000")},
        {"category_id": 2, "name": "주거비", "type": "fixed", "amount": Decimal("800000")},  # fixed, ignored
        {"category_id": 3, "name": "쇼핑", "type": "variable", "amount": Decimal("119000")},
        {"category_id": 4, "name": "경조사비", "type": "irregular", "amount": Decimal("500000")},  # irregular, ignored
    ]
    trailing_avg = {1: Decimal("100000"), 3: Decimal("100000"), 4: Decimal("100000")}

    insights = variable_spend_trend_insights(breakdown, trailing_avg)

    flagged = {i.message.split()[0] for i in insights}
    assert flagged == {"식비"}  # 20% increase flagged, 19% not, fixed/irregular categories never considered


# --- discretionary ratio: (여가+쇼핑)/income >= 15% ------------------------------------------

@pytest.mark.parametrize("discretionary,expected", [(140_000, None), (150_000, "warning"), (200_000, "warning")])
def test_discretionary_ratio_boundaries(discretionary, expected):
    totals = _totals(1_000_000, discretionary, 0, discretionary)
    breakdown = [{"name": "여가", "amount": Decimal(discretionary), "is_discretionary": True}]
    insight = discretionary_ratio_insight(totals, breakdown)
    if expected is None:
        assert insight is None
    else:
        assert insight.severity == expected


# --- debt ratio: 대출상환/income >= 30% ------------------------------------------------------

@pytest.mark.parametrize("debt,expected", [(290_000, None), (300_000, "warning"), (350_000, "warning")])
def test_debt_ratio_boundaries(debt, expected):
    totals = _totals(1_000_000, debt, debt, 0)
    breakdown = [{"name": "대출상환", "amount": Decimal(debt), "is_debt": True}]
    insight = debt_ratio_insight(totals, breakdown)
    if expected is None:
        assert insight is None
    else:
        assert insight.severity == expected


# --- goal pace: actual savings vs sum of goals' monthly_saving_amount ----------------------

@pytest.mark.parametrize(
    "actual_savings,target_monthly,expected_severity",
    [
        (300_000, 1_000_000, "critical"),  # 30%
        (690_000, 1_000_000, "critical"),  # 69%
        (700_000, 1_000_000, "warning"),  # exactly 70% -> boundary is warning
        (990_000, 1_000_000, "warning"),  # 99%
        (1_000_000, 1_000_000, "info"),  # exactly 100% -> boundary is info
        (1_200_000, 1_000_000, "info"),  # 120%
    ],
)
def test_goal_pace_boundaries(actual_savings, target_monthly, expected_severity):
    totals = _totals(1_000_000, 1_000_000 - actual_savings, 0, 1_000_000 - actual_savings)
    goals = [{"monthly_saving_amount": Decimal(target_monthly)}]
    insight = goal_pace_insight(totals, goals)
    assert insight.severity == expected_severity


def test_goal_pace_skips_when_no_goals():
    assert goal_pace_insight(_totals(1_000_000, 500_000, 0, 500_000), []) is None


def test_goal_pace_sums_across_multiple_goals():
    totals = _totals(1_000_000, 500_000, 0, 500_000)  # 500,000 savings
    goals = [{"monthly_saving_amount": Decimal("300000")}, {"monthly_saving_amount": Decimal("200000")}]
    insight = goal_pace_insight(totals, goals)
    assert insight.severity == "info"  # 500,000 / 500,000 = 100%


# --- savings execution: actual net-worth savings growth vs theoretical surplus ------------

@pytest.mark.parametrize(
    "surplus,actual_saved,expected_severity",
    [
        (1_000_000, 400_000, "critical"),  # 40%
        (1_000_000, 490_000, "critical"),  # 49%
        (1_000_000, 500_000, "warning"),  # exactly 50% -> boundary is warning
        (1_000_000, 790_000, "warning"),  # 79%
        (1_000_000, 800_000, "info"),  # exactly 80% -> boundary is info
        (1_000_000, 1_000_000, "info"),  # 100%
    ],
)
def test_savings_execution_boundaries(surplus, actual_saved, expected_severity):
    insight = savings_execution_insight(Decimal(surplus), Decimal(actual_saved))
    assert insight.severity == expected_severity


def test_savings_execution_skips_when_no_prior_snapshot():
    assert savings_execution_insight(Decimal("1000000"), None) is None


def test_savings_execution_skips_when_no_surplus():
    assert savings_execution_insight(Decimal("0"), Decimal("100000")) is None
    assert savings_execution_insight(Decimal("-100000"), Decimal("100000")) is None


# --- emergency fund: <3mo critical-ish warning, <6mo info(build up), >=6mo info(sufficient) --

def test_emergency_fund_below_minimum_is_warning():
    insight = emergency_fund_insight(Decimal("2000000"), Decimal("1000000"))  # 2 months
    assert insight.severity == "warning"


def test_emergency_fund_between_min_and_target_is_info():
    insight = emergency_fund_insight(Decimal("4000000"), Decimal("1000000"))  # 4 months
    assert insight.severity == "info"
    assert "이상적" in insight.message


def test_emergency_fund_at_target_is_sufficient():
    insight = emergency_fund_insight(Decimal("6000000"), Decimal("1000000"))  # 6 months
    assert insight.severity == "info"
    assert "충분" in insight.message


def test_emergency_fund_skips_when_no_balance_set():
    assert emergency_fund_insight(None, Decimal("1000000")) is None


# --- savings streak: consecutive trailing months meeting target, counted from the most recent -

def _trend_row(income, expense):
    return {"income": Decimal(income), "expense": Decimal(expense)}


def test_savings_streak_counts_consecutive_months_hitting_target():
    trend = [_trend_row(2_000_000, 1_500_000) for _ in range(3)]  # 500,000 savings each month
    assert savings_streak_months(trend, Decimal("500000")) == 3


def test_savings_streak_stops_at_first_miss_from_the_end():
    trend = [
        _trend_row(2_000_000, 1_500_000),  # met (oldest)
        _trend_row(2_000_000, 1_900_000),  # missed
        _trend_row(2_000_000, 1_500_000),  # met
        _trend_row(2_000_000, 1_500_000),  # met (most recent)
    ]
    assert savings_streak_months(trend, Decimal("500000")) == 2


def test_savings_streak_is_zero_without_a_target():
    trend = [_trend_row(2_000_000, 1_500_000)]
    assert savings_streak_months(trend, Decimal("0")) == 0


# --- end-to-end wiring through compute_insights (uses real DB-backed services) -------------

def test_compute_insights_end_to_end(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    ym = "2026-07"
    transaction_service.create_transaction(db, user.id, rent.id, "income", Decimal("3000000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("1600000"), date(2026, 7, 2))  # 53% fixed
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, food.name, Decimal("100000"), 0, ym, user.id, category_id=food.id
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("100000"), date(2026, 7, 10))

    insights = coaching_engine.compute_insights(db, ym)

    rule_codes = {i.rule_code for i in insights}
    assert "fixed_cost_ratio" in rule_codes  # 53% fixed >= 50% critical
    assert "budget_overrun" in rule_codes  # 식비 at 100%
    # critical items should sort before warning items
    severities = [i.severity for i in insights]
    assert severities == sorted(severities, key=lambda s: {"critical": 0, "warning": 1, "info": 2}[s])


def test_compute_insights_includes_goal_pace_when_goals_exist(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    goal_service.create_goal(db, 1, "내집마련", 40, Decimal("100000000"), Decimal("1000000"))
    transaction_service.create_transaction(db, user.id, rent.id, "income", Decimal("2000000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1800000"), date(2026, 7, 2))

    insights = coaching_engine.compute_insights(db, "2026-07")

    assert any(i.rule_code == "goal_pace" for i in insights)


def test_compute_insights_includes_savings_execution_when_snapshots_exist(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "income", Decimal("2000000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), date(2026, 7, 2))
    # surplus = 1,000,000; only 300,000 actually moved into savings this month
    product = savings_product_service.create_product(db, "적금", Decimal("0"), Decimal("300000"))
    net_worth_service.record_snapshot(db, today=date(2026, 6, 30))
    savings_product_service.update_product(db, product.id, "적금", Decimal("300000"), Decimal("300000"), "savings")
    net_worth_service.record_snapshot(db, today=date(2026, 7, 31))

    insights = coaching_engine.compute_insights(db, "2026-07")

    savings_execution = next(i for i in insights if i.rule_code == "savings_execution")
    assert savings_execution.severity == "critical"  # 30%


def test_compute_insights_skips_savings_execution_without_two_snapshots(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "income", Decimal("2000000"), date(2026, 7, 1))
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("1000000"), date(2026, 7, 2))

    insights = coaching_engine.compute_insights(db, "2026-07")

    assert not any(i.rule_code == "savings_execution" for i in insights)


def test_compute_insights_includes_emergency_fund_when_balance_set(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user.id, rent.id, "expense", Decimal("1000000"), date(2026, 6, 1))
    user_setting_service.set_shared_setting(
        db, user_setting_service.EMERGENCY_FUND_BALANCE_KEY, "2000000", user.id
    )

    insights = coaching_engine.compute_insights(db, "2026-07")

    assert any(i.rule_code == "emergency_fund" for i in insights)
