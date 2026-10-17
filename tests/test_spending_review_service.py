from datetime import date
from decimal import Decimal

import pytest

from app.models.recurring_expense import RecurringExpense
from app.services import cashflow_plan_service, spending_review_service, transaction_service
from app.services.spending_review_service import (
    CategoryMeta,
    SavingOpportunity,
    TxRow,
    benchmark_excess_opportunities,
    chronic_overrun_opportunities,
    is_cuttable_category,
    merge_opportunities,
    normalize_description,
    small_frequent_opportunities,
    subscription_opportunities,
    trend_up_opportunities,
    unregistered_recurring_opportunities,
)
from app.utils.money import monthly_equivalent

D = Decimal
FOOD = CategoryMeta(1, "식비", "variable", benchmark_group="food")
SHOPPING = CategoryMeta(2, "쇼핑", "variable", is_discretionary=True)
RENT = CategoryMeta(3, "주거비", "fixed", benchmark_group="housing")
SUBS = CategoryMeta(4, "구독료", "fixed")
INSURANCE = CategoryMeta(5, "보험료", "fixed")
LOAN = CategoryMeta(6, "대출상환", "fixed", is_debt=True)
META = {c.id: c for c in (FOOD, SHOPPING, RENT, SUBS, INSURANCE, LOAN)}


def _opp(rule, cats, saving, title="t"):
    return SavingOpportunity(rule, "info", title, "", D(saving), D(saving), frozenset(cats))


# --- monthly_equivalent ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "amount,frequency,occurrences,expected",
    [
        ("10000", "monthly", 1, "10000"),
        ("10000", "monthly", 2, "20000"),
        ("120000", "yearly", 1, "10000"),
        ("10000", "weekly", 1, "43333"),
    ],
)
def test_monthly_equivalent(amount, frequency, occurrences, expected):
    assert monthly_equivalent(D(amount), frequency, occurrences) == D(expected)


# --- trend_up: variable only, change >= flag_pct ----------------------------------------------


@pytest.mark.parametrize(
    "current,avg,expected_saving",
    [
        ("119000", "100000", None),  # +19% < 20%
        ("120000", "100000", "20000"),  # exactly +20% -> flagged
        ("150000", "100000", "50000"),
    ],
)
def test_trend_up_boundaries(current, avg, expected_saving):
    result = trend_up_opportunities({1: D(current)}, {1: D(avg)}, META, 20, 6)
    if expected_saving is None:
        assert result == []
    else:
        assert [o.estimated_monthly_saving for o in result] == [D(expected_saving)]


def test_trend_up_ignores_fixed_and_no_history():
    assert trend_up_opportunities({3: D("2000000"), 1: D("50000")}, {3: D("1000000")}, META, 20, 6) == []


# --- benchmark_excess: excess over guideline amount -------------------------------------------


@pytest.mark.parametrize(
    "food_avg,expected_saving",
    [
        ("150000", None),  # exactly 15% of 1,000,000 -> nothing to cut
        ("150001", "1"),
        ("200000", "50000"),
    ],
)
def test_benchmark_excess_boundaries(food_avg, expected_saving):
    result = benchmark_excess_opportunities(D("1000000"), {1: D(food_avg)}, META, {"food": 15, "housing": 28})
    if expected_saving is None:
        assert result == []
    else:
        assert result[0].estimated_monthly_saving == D(expected_saving)
        assert result[0].category_ids == frozenset({1})


def test_benchmark_excess_skips_without_income_or_untagged():
    assert benchmark_excess_opportunities(D("0"), {1: D("500000")}, META, {"food": 15}) == []
    assert benchmark_excess_opportunities(D("1000000"), {2: D("900000")}, META, {"food": 15}) == []


# --- chronic_overrun: every month over budget -------------------------------------------------


def test_chronic_overrun_requires_every_month_over():
    over = [({1: D("100000")}, {1: D("130000")}), ({1: D("100000")}, {1: D("110000")}), ({1: D("100000")}, {1: D("120000")})]
    result = chronic_overrun_opportunities(over, META)
    assert len(result) == 1
    assert result[0].estimated_monthly_saving == D("20000")  # avg of 30k/10k/20k

    one_month_ok = [over[0], ({1: D("100000")}, {1: D("100000")}), over[2]]  # exactly at budget is not over
    assert chronic_overrun_opportunities(one_month_ok, META) == []


def test_chronic_overrun_skips_unbudgeted():
    assert chronic_overrun_opportunities([({}, {1: D("500000")})] * 3, META) == []


# --- small_frequent ---------------------------------------------------------------------------


def _tx(cat, amount, ym="2026-09", desc=None, rec=None, type_="expense"):
    return TxRow(ym, type_, cat, D(amount), desc, rec)


@pytest.mark.parametrize("count,flagged", [(7, False), (8, True)])
def test_small_frequent_min_count(count, flagged):
    rows = [_tx(2, "5000") for _ in range(count)]
    result = small_frequent_opportunities(rows, META, D("15000"), 8, 30)
    assert bool(result) is flagged
    if flagged:
        assert result[0].estimated_monthly_saving == D("12000")  # 40,000 * 30%


def test_small_frequent_ignores_large_and_non_discretionary():
    rows = [_tx(2, "15001") for _ in range(10)] + [_tx(1, "5000") for _ in range(10)]
    assert small_frequent_opportunities(rows, META, D("15000"), 8, 30) == []


# --- subscriptions / cuttable categories ------------------------------------------------------


def test_is_cuttable_category():
    assert is_cuttable_category(SUBS)
    assert is_cuttable_category(SHOPPING)
    assert not is_cuttable_category(RENT)  # housing group
    assert not is_cuttable_category(INSURANCE)  # 이름에 "보험"
    assert not is_cuttable_category(LOAN)


def test_subscription_opportunities_monthly_equivalent_and_filters():
    recs = [
        RecurringExpense(name="넷플릭스", category_id=4, amount=D("17000"), type="expense", frequency="monthly"),
        RecurringExpense(name="연회비", category_id=4, amount=D("120000"), type="expense", frequency="yearly"),
        RecurringExpense(name="월세", category_id=3, amount=D("800000"), type="expense", frequency="monthly"),
        RecurringExpense(name="실손", category_id=5, amount=D("30000"), type="expense", frequency="monthly"),
    ]
    result = subscription_opportunities(recs, META)
    assert {o.title: o.estimated_monthly_saving for o in result} == {
        "정기결제 점검: 넷플릭스": D("17000"),
        "정기결제 점검: 연회비": D("10000"),
    }


# --- unregistered recurring -------------------------------------------------------------------


def test_normalize_description():
    assert normalize_description("넷플릭스 10월") == normalize_description("넷플릭스  9월 ") == "넷플릭스"
    assert normalize_description("NETFLIX.COM") == "netflixcom"
    assert normalize_description(None) == ""


MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09"]


@pytest.mark.parametrize(
    "amounts,flagged",
    [
        (["10000", "10000", "10000", None], True),  # 3 of 4 months
        (["10000", "10000", None, None], False),  # only 2 months
        (["10000", "10000", "11000", None], True),  # within ±10% of median
        (["10000", "10000", "11001", None], False),  # just outside
    ],
)
def test_unregistered_recurring_detection(amounts, flagged):
    rows = [_tx(4, a, ym, desc=f"유튜브 프리미엄 {ym}") for ym, a in zip(MONTHS, amounts, strict=True) if a]
    result = unregistered_recurring_opportunities(rows, MONTHS, META, 3, 10)
    assert bool(result) is flagged
    if flagged:
        assert result[0].estimated_monthly_saving == D("10000")


def test_unregistered_recurring_skips_registered_and_non_cuttable():
    registered = [_tx(4, "10000", ym, desc="넷플릭스", rec=1) for ym in MONTHS]
    by_name = [_tx(4, "10000", ym, desc="왓챠") for ym in MONTHS]
    rent = [_tx(3, "800000", ym, desc="월세") for ym in MONTHS]
    assert unregistered_recurring_opportunities(registered + rent, MONTHS, META, 3, 10) == []
    assert unregistered_recurring_opportunities(by_name, MONTHS, META, 3, 10, registered_names={"왓챠"}) == []


# --- merge -----------------------------------------------------------------------------------


def test_merge_keeps_largest_overlapping_category_rule_and_attaches_related():
    trend = _opp("trend_up", {1}, "20000", "trend")
    bench = _opp("benchmark_excess", {1, 2}, "50000", "bench")
    small = _opp("small_frequent", {9}, "3000", "small")
    items, total = merge_opportunities([trend, bench, small])
    assert [i.title for i in items] == ["bench", "small"]
    assert items[0].related == ["trend"]
    assert total == D("53000")


def test_merge_items_counted_with_max_against_category_rule():
    trend = _opp("trend_up", {4}, "5000")
    sub_a = _opp("subscription", {4}, "17000")
    sub_b = _opp("subscription", {4}, "10000")
    other = _opp("unregistered_recurring", {2}, "8000")
    items, total = merge_opportunities([trend, sub_a, sub_b, other])
    assert len(items) == 4  # 항목 단위는 모두 노출
    assert total == D("27000") + D("8000")  # max(5000, 27000) + 8000


# --- build_spending_review (DB) ---------------------------------------------------------------


def _expense(db, user, cat, amount, d, **kw):
    return transaction_service.create_transaction(db, user.id, cat.id, "expense", D(amount), d, **kw)


def test_build_spending_review_defaults_to_last_month_and_flags_trend(seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]
    for month in (4, 5, 6, 7, 8):
        _expense(db, user, food, "100000", date(2026, month, 10))
        transaction_service.create_transaction(db, user.id, salary.id, "income", D("3000000"), date(2026, month, 1))
    _expense(db, user, food, "180000", date(2026, 9, 10))
    _expense(db, user, food, "999999", date(2026, 10, 3))  # 진행 중인 달은 기본 기준월이 아니다

    review = spending_review_service.build_spending_review(db, today=date(2026, 10, 15))

    assert review["year_month"] == "2026-09"
    assert review["months_analyzed"] == 5  # 2026-03은 거래가 없어 평균에서 빠진다
    trend = next(i for i in review["items"] if i["rule_code"] == "trend_up")
    assert trend["estimated_monthly_saving"] == D("80000")
    assert review["total_estimated_monthly_saving"] == D("80000")


def test_build_spending_review_owner_filter_skips_household_rules(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    db.add(
        RecurringExpense(
            name="넷플릭스", category_id=food.id, amount=D("17000"), type="expense", frequency="monthly",
            start_date=date(2026, 1, 1), next_due_date=date(2026, 11, 1),
        )
    )
    db.commit()

    household = spending_review_service.build_spending_review(db, "2026-09", today=date(2026, 10, 15))
    mine = spending_review_service.build_spending_review(db, "2026-09", owner=user.id, today=date(2026, 10, 15))

    assert [i["rule_code"] for i in household["items"]] == ["subscription"]
    assert mine["items"] == []


def test_build_spending_review_chronic_overrun_uses_plan_budget(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    for month in (7, 8, 9):
        ym = f"2026-{month:02d}"
        cashflow_plan_service.upsert_item(
            db, None, "variable", None, "외식", D("100000"), 0, ym, user.id, category_id=food.id
        )
        _expense(db, user, food, "130000", date(2026, month, 10))

    review = spending_review_service.build_spending_review(db, "2026-09", today=date(2026, 10, 15))

    overrun = next(i for i in review["items"] if i["rule_code"] == "chronic_overrun")
    assert overrun["estimated_monthly_saving"] == D("30000")


def test_build_excludes_insurance_from_benchmark_excess(seeded_db):
    """보험료는 보험 점검이 계약 기준으로 본다 — 소비 점검 벤치마크에서 두 번 세지 않는다."""
    from app.models.category import Category

    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    insurance = Category(name="보험료", type="fixed", color="#8b5cf6", benchmark_group="insurance")
    db.add(insurance)
    db.commit()
    for month in (7, 8, 9):
        transaction_service.create_transaction(db, user.id, salary.id, "income", D("1000000"), date(2026, month, 1))
        _expense(db, user, insurance, "500000", date(2026, month, 5))

    review = spending_review_service.build_spending_review(db, "2026-09", today=date(2026, 10, 15))

    assert [i for i in review["items"] if i["category_id"] == insurance.id and i["rule_code"] == "benchmark_excess"] == []


def test_build_flags_small_frequent_and_unregistered_recurring(seeded_db):
    from app.models.category import Category

    db, user = seeded_db["db"], seeded_db["user"]
    cafe = Category(name="카페", type="variable", color="#a16207", is_discretionary=True)
    subs = Category(name="구독", type="fixed", color="#0ea5e9")
    db.add_all([cafe, subs])
    db.commit()
    for day in range(1, 9):  # 8회 × 5,000원
        _expense(db, user, cafe, "5000", date(2026, 9, day))
    for month in (7, 8, 9):
        _expense(db, user, subs, "10900", date(2026, month, 20), description="유튜브 프리미엄")

    review = spending_review_service.build_spending_review(db, "2026-09", today=date(2026, 10, 15))

    by_rule = {i["rule_code"]: i for i in review["items"]}
    assert by_rule["small_frequent"]["estimated_monthly_saving"] == D("12000")  # 40,000 × 30%
    assert by_rule["unregistered_recurring"]["category_id"] == subs.id
