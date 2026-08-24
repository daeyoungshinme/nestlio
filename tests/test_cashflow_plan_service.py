from datetime import date
from decimal import Decimal

import pytest

from app.models.category import Category
from app.services import annual_plan_service, cashflow_plan_service, recurring_service, transaction_service
from app.utils.dates import year_month_str


def _add_tx(db, user, category, type_, amount, tx_date):
    return transaction_service.create_transaction(
        db,
        user_id=user.id,
        category_id=category.id,
        type_=type_,
        amount=Decimal(amount),
        transaction_date=tx_date,
    )


def _income_category(db):
    cat = Category(name="근로소득", kind="income", type="fixed", color="#22c55e", sort_order=0)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def test_upsert_item_creates_then_updates(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    ym = "2026-07"

    created = cashflow_plan_service.upsert_item(
        db, None, "income", user.id, "근로/사업소득", Decimal("5000000"), 0, ym, user.id
    )
    assert created.id is not None
    assert created.amount == Decimal("5000000")
    assert created.year_month == ym

    updated = cashflow_plan_service.upsert_item(
        db, created.id, "income", user.id, "근로/사업소득", Decimal("5500000"), 0, ym, user.id
    )
    assert updated.id == created.id
    assert updated.amount == Decimal("5500000")

    items = cashflow_plan_service.list_items(db, ym)
    assert len(items) == 1


def test_list_items_filters_by_year_month(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "보장성보험", Decimal("60000"), 0, "2026-07", user.id)
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "보장성보험", Decimal("60000"), 0, "2026-08", user.id)

    assert len(cashflow_plan_service.list_items(db, "2026-07")) == 1
    assert len(cashflow_plan_service.list_items(db, "2026-08")) == 1


def test_delete_item(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "보장성보험", Decimal("60000"), 0, "2026-07", user.id
    )

    cashflow_plan_service.delete_item(db, item.id)

    assert cashflow_plan_service.list_items(db, "2026-07") == []


def test_copy_from_previous_month_skips_existing_section_name(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id)
    cashflow_plan_service.upsert_item(db, None, "variable", None, "식료품비", Decimal("400000"), 0, "2026-07", user.id)
    # already present in August with a different amount - should NOT be overwritten
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "월세", Decimal("900000"), 0, "2026-08", user.id)

    copied = cashflow_plan_service.copy_from_previous_month(db, "2026-08", user.id)

    august_items = cashflow_plan_service.list_items(db, "2026-08")
    assert copied == 1  # only 식료품비 was missing
    rent = next(i for i in august_items if i.name == "월세")
    groceries = next(i for i in august_items if i.name == "식료품비")
    assert rent.amount == Decimal("900000")  # untouched
    assert groceries.amount == Decimal("400000")


def test_compute_summary_totals_and_available(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(
        db, None, "income", user.id, "근로/사업소득", Decimal("8000000"), 0, "2026-07", user.id
    )
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "보장성보험", Decimal("600000"), 0, "2026-07", user.id)
    cashflow_plan_service.upsert_item(db, None, "variable", None, "식료품비", Decimal("400000"), 0, "2026-07", user.id)
    cashflow_plan_service.upsert_item(db, None, "irregular", None, "휴가비", Decimal("500000"), 0, "2026-07", user.id)

    summary = cashflow_plan_service.compute_summary(cashflow_plan_service.list_items(db, "2026-07"))

    assert summary["income"]["planned"] == Decimal("8000000")
    assert summary["expense_total"] == Decimal("1500000")
    assert summary["available"] == Decimal("6500000")


def test_compute_summary_empty_items_are_zero():
    summary = cashflow_plan_service.compute_summary([])

    assert summary["income"]["planned"] == Decimal("0")
    assert summary["expense_total"] == Decimal("0")
    assert summary["available"] == Decimal("0")


def test_compute_summary_irregular_without_actuals_key_is_none(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(db, None, "irregular", None, "휴가비", Decimal("500000"), 0, "2026-07", user.id)

    summary = cashflow_plan_service.compute_summary(cashflow_plan_service.list_items(db, "2026-07"), actuals={})

    assert summary["irregular"]["planned"] == Decimal("500000")
    assert summary["irregular"]["actual"] is None
    assert summary["irregular"]["pct"] is None
    assert summary["irregular"]["status"] is None


def test_compute_summary_irregular_actual_when_present(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(db, None, "irregular", None, "휴가비", Decimal("500000"), 0, "2026-07", user.id)

    summary = cashflow_plan_service.compute_summary(
        cashflow_plan_service.list_items(db, "2026-07"), actuals={"irregular": Decimal("600000")}
    )

    assert summary["irregular"]["planned"] == Decimal("500000")
    assert summary["irregular"]["actual"] == Decimal("600000")
    assert summary["irregular"]["pct"] == 120.0
    assert summary["irregular"]["status"] == "critical"


def test_suggested_totals_is_trailing_average_by_section(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _add_tx(db, user, food, "expense", "200000", date(2026, 4, 20))
    _add_tx(db, user, food, "expense", "100000", date(2026, 5, 20))
    _add_tx(db, user, food, "expense", "300000", date(2026, 6, 20))

    suggested = cashflow_plan_service.suggested_totals(db, "2026-07")

    assert suggested["variable"] == Decimal("200000")  # (200000+100000+300000)/3


def test_compute_summary_includes_suggested_amount(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    cashflow_plan_service.upsert_item(db, None, "income", user.id, "근로/사업소득", Decimal("8000000"), 0, "2026-07", user.id)

    summary = cashflow_plan_service.compute_summary(
        cashflow_plan_service.list_items(db, "2026-07"),
        actuals={"income": Decimal("7000000")},
        suggested={"income": Decimal("7500000")},
    )

    assert summary["income"]["suggested_amount"] == Decimal("7500000")


def test_actuals_for_month_matches_category_type(seeded_db):
    db, user, food, rent, events = (
        seeded_db["db"],
        seeded_db["user"],
        seeded_db["food"],
        seeded_db["rent"],
        seeded_db["events"],
    )
    income_cat = _income_category(db)
    ym = year_month_str(date(2026, 7, 15))
    _add_tx(db, user, income_cat, "income", "5000000", date(2026, 7, 5))
    _add_tx(db, user, food, "expense", "300000", date(2026, 7, 10))
    _add_tx(db, user, rent, "expense", "800000", date(2026, 7, 1))
    _add_tx(db, user, events, "expense", "150000", date(2026, 7, 12))

    actuals = cashflow_plan_service.actuals_for_month(db, ym)

    assert actuals["income"] == Decimal("5000000")
    assert actuals["variable"] == Decimal("300000")
    assert actuals["fixed"] == Decimal("800000")
    assert actuals["irregular"] == Decimal("150000")


def test_section_summary_status_fixed_over_budget_is_critical(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    ym = "2026-07"
    cashflow_plan_service.upsert_item(db, None, "fixed", None, "주거비", Decimal("500000"), 0, ym, user.id)
    _add_tx(db, user, rent, "expense", "500000", date(2026, 7, 1))

    summary = cashflow_plan_service.compute_summary(
        cashflow_plan_service.list_items(db, ym), {"fixed": Decimal("500000")}
    )

    assert summary["fixed"]["pct"] == 100.0
    assert summary["fixed"]["status"] == "critical"


def test_split_item_into_months_distributes_remainder_and_dates(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    created = cashflow_plan_service.split_item_into_months(
        db, "irregular", None, "자동차보험료", Decimal("1000000"), "2026-07", 12, 0, user.id
    )

    assert len(created) == 12
    assert sum((i.amount for i in created), Decimal("0")) == Decimal("1000000")
    assert [i.year_month for i in created] == [
        "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
        "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
    ]
    assert [i.installment_no for i in created] == list(range(1, 13))
    assert all(i.installment_total == 12 for i in created)
    assert all(i.installment_total_amount == Decimal("1000000") for i in created)
    # 1,000,000 / 12 = 83,333.33.., remainder distributed 1원씩 to the first months
    assert created[0].amount == Decimal("83334")
    assert created[-1].amount == Decimal("83333")


def test_split_item_into_months_remainder_matches_frontend(seeded_db):
    """frontend/src/utils/__tests__/monthRange.test.ts의 "distributes the remainder 1 won at a
    time" 테스트와 정확히 같은 입력(100,000원 / 3개월)을 쓴다 — 두 구현 모두 1원 단위로 나머지를
    앞쪽 달부터 배분하므로 결과가 같아야 한다. 반올림 단위가 둘 중 한쪽만 바뀌면 이 테스트와
    monthRange.test.ts를 나란히 비교해 알아챌 수 있어야 한다."""
    db, user = seeded_db["db"], seeded_db["user"]

    created = cashflow_plan_service.split_item_into_months(
        db, "irregular", None, "테스트", Decimal("100000"), "2026-09", 3, 0, user.id
    )

    assert [i.amount for i in created] == [Decimal("33334"), Decimal("33333"), Decimal("33333")]


def test_split_item_then_editing_one_month_does_not_affect_others(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    created = cashflow_plan_service.split_item_into_months(
        db, "irregular", None, "재산세", Decimal("120000"), "2026-07", 12, 0, user.id
    )
    third = created[2]

    cashflow_plan_service.upsert_item(
        db, third.id, "irregular", None, "재산세", Decimal("999999"), 0, third.year_month, user.id
    )

    others = [i for i in created if i.id != third.id]
    for item in others:
        db.refresh(item)
        assert item.amount == Decimal("10000.00")
    db.refresh(third)
    assert third.amount == Decimal("999999")


def test_category_tagged_item_is_included_in_list_and_section_summary(seeded_db):
    """A category-tagged plan item (what used to be a budget_service-only row) must show up in the
    same list as free-text items and count toward the section's planned total."""
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    ym = "2026-07"
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, food.name, Decimal("300000"), 0, ym, user.id, category_id=food.id
    )

    items = cashflow_plan_service.list_items(db, ym)
    assert len(items) == 1
    assert items[0].category_id == food.id

    summary = cashflow_plan_service.compute_summary(items)
    assert summary["variable"]["planned"] == Decimal("300000")


def test_copy_from_previous_month_dedups_category_tagged_items_by_category_not_name(seeded_db):
    """Two category-tagged items with different names but the same category should only copy once,
    unlike free-text items which dedup by name."""
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, "외식", Decimal("70000"), 0, "2026-07", user.id, category_id=food.id
    )
    # already present in August under a different name but same category - should NOT be duplicated
    cashflow_plan_service.upsert_item(
        db, None, food.type, None, "식비", Decimal("90000"), 0, "2026-08", user.id, category_id=food.id
    )

    copied = cashflow_plan_service.copy_from_previous_month(db, "2026-08", user.id)

    august_items = cashflow_plan_service.list_items(db, "2026-08")
    assert copied == 0
    assert len(august_items) == 1
    assert august_items[0].amount == Decimal("90000")  # untouched


def test_section_summary_status_income_direction_is_inverted():
    from app.models.cashflow_plan_item import CashflowPlanItem

    item = CashflowPlanItem(
        section="income", year_month="2026-07", name="근로소득", own_amount=Decimal("1000000"), sort_order=0
    )

    # over-achieving income should never be flagged
    over = cashflow_plan_service.compute_summary([item], actuals={"income": Decimal("1500000")})
    assert over["income"]["status"] == "ok"

    # achieved only 5% of planned income -> shortfall (100-5=95) crosses warn threshold (90) but not critical (100)
    shortfall = cashflow_plan_service.compute_summary([item], actuals={"income": Decimal("50000")})
    assert shortfall["income"]["pct"] == 5.0
    assert shortfall["income"]["status"] == "warn"

    # zero income actual -> shortfall (100-0=100) crosses critical threshold (100)
    zero = cashflow_plan_service.compute_summary([item], actuals={"income": Decimal("0")})
    assert zero["income"]["status"] == "critical"


def test_link_recurring_sets_fk(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id, category_id=rent.id
    )
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )

    linked = cashflow_plan_service.link_recurring(db, item.id, recurring.id)

    assert linked.recurring_expense_id == recurring.id
    assert linked.recurring_active is True


def test_link_recurring_rejects_already_linked_item(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id, category_id=rent.id
    )
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    cashflow_plan_service.link_recurring(db, item.id, recurring.id)
    other_recurring = recurring_service.create_recurring(
        db, name="월세2", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )

    with pytest.raises(ValueError):
        cashflow_plan_service.link_recurring(db, item.id, other_recurring.id)


def test_link_recurring_rejects_missing_recurring_expense(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id
    )

    with pytest.raises(cashflow_plan_service.RecurringExpenseNotFoundError):
        cashflow_plan_service.link_recurring(db, item.id, 999999)


def test_link_recurring_returns_none_for_missing_item(seeded_db):
    db = seeded_db["db"]

    assert cashflow_plan_service.link_recurring(db, 999999, 1) is None


def test_linked_item_reads_through_recurring_amount_and_category(seeded_db):
    """Once linked, the plan item's amount/category must always reflect the recurring expense's current
    values, not the value copied in at link time - editing the recurring afterwards should show up
    immediately without touching the plan item again."""
    db, user, rent, food = seeded_db["db"], seeded_db["user"], seeded_db["rent"], seeded_db["food"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id, category_id=rent.id
    )
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    cashflow_plan_service.link_recurring(db, item.id, recurring.id)

    recurring_service.update_recurring(db, recurring.id, amount=Decimal("850000"), category_id=food.id)

    [refreshed] = cashflow_plan_service.list_items(db, "2026-07")
    assert refreshed.amount == Decimal("850000")
    assert refreshed.category_id == food.id
    assert refreshed.category_name == food.name

    summary = cashflow_plan_service.compute_summary([refreshed])
    assert summary["fixed"]["planned"] == Decimal("850000")


def test_copy_from_previous_month_carries_recurring_link_forward(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    item = cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("800000"), 0, "2026-07", user.id, category_id=rent.id
    )
    recurring = recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    cashflow_plan_service.link_recurring(db, item.id, recurring.id)

    cashflow_plan_service.copy_from_previous_month(db, "2026-08", user.id)

    august_items = cashflow_plan_service.list_items(db, "2026-08")
    rent_item = next(i for i in august_items if i.name == "월세")
    assert rent_item.recurring_expense_id == recurring.id


def test_annual_fallback_fills_month_with_no_matching_item(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "월세", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("800000")}],
    )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")

    assert len(items) == 1
    fallback = items[0]
    assert fallback.id is None
    assert fallback.from_annual_plan is True
    assert fallback.amount == Decimal("800000")
    assert fallback.category_id == rent.id

    summary = cashflow_plan_service.compute_summary(items)
    assert summary["fixed"]["planned"] == Decimal("800000")


def test_annual_fallback_gives_distinct_ids_for_items_sharing_a_category(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    first = annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "티빙", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("5000")}],
    )
    second = annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "유튜브", rent.id, 1, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("14900")}],
    )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")

    assert len(items) == 2
    ids = {item.annual_plan_item_id for item in items}
    assert ids == {first.id, second.id}


def test_annual_fallback_skips_month_with_existing_matching_item(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "월세", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("800000")}],
    )
    cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "월세", Decimal("850000"), 0, "2026-07", user.id, category_id=rent.id
    )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")

    assert len(items) == 1
    real_item = items[0]
    assert real_item.id is not None
    assert real_item.amount == Decimal("850000")


def test_annual_fallback_still_shows_when_only_category_matches_not_name(seeded_db):
    """같은 카테고리를 쓰지만 이름이 다른 실제 항목이 이미 있어도, 연간계획 항목은 폴백으로 계속
    노출되어야 한다 — category_id만으로 매칭하면 이 연간계획 항목이 통째로 가려지는 게 이번에 고친 버그다."""
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "월세", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("800000")}],
    )
    cashflow_plan_service.upsert_item(
        db, None, "fixed", None, "관리비", Decimal("150000"), 1, "2026-07", user.id, category_id=rent.id
    )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")

    assert len(items) == 2
    real_item = next(i for i in items if i.id is not None)
    fallback = next(i for i in items if i.id is None)
    assert real_item.name == "관리비"
    assert real_item.amount == Decimal("150000")
    assert fallback.name == "월세"
    assert fallback.from_annual_plan is True
    assert fallback.amount == Decimal("800000")


def test_editing_annual_fallback_promotes_it_and_detaches_from_future_annual_edits(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    annual_item = annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "월세", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("800000")}],
    )

    [fallback] = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")
    saved = cashflow_plan_service.upsert_item(
        db, fallback.id, fallback.section, fallback.owner_user_id, fallback.name, Decimal("900000"),
        fallback.sort_order, "2026-07", user.id, category_id=fallback.category_id,
    )
    assert saved.id is not None

    # Changing the annual plan afterwards must not overwrite the already-materialized month.
    annual_plan_service.upsert_item(
        db, annual_item.id, 2026, "fixed", None, "월세", rent.id, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("1000000")}],
    )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")
    assert len(items) == 1
    assert items[0].id == saved.id
    assert items[0].amount == Decimal("900000")


def test_renaming_annual_item_after_promotion_still_matches_promoted_item(seeded_db):
    """카테고리가 없는(자유 텍스트) 연간계획 항목을 승격시킨 뒤 이름을 여러 번 바꿔도, annual_plan_item_id로
    연결되어 있으므로 승격된 실제 행이 계속 그 자리를 대표해야 한다 — 이름 문자열 매칭에 의존하면 이름이
    바뀔 때마다 별개의 폴백 항목이 추가로 생겨 중복되거나(구 버그), 반대로 실제 행이 고아가 되어 최신
    연간계획 값이 영원히 반영되지 않는다."""
    db, user = seeded_db["db"], seeded_db["user"]
    annual_item = annual_plan_service.upsert_item(
        db, None, 2026, "irregular", None, "재산세", None, 0, user.id, "2026-01", "2026-12",
        monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("300000")}],
    )

    [fallback] = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")
    saved = cashflow_plan_service.upsert_item(
        db, fallback.id, fallback.section, fallback.owner_user_id, fallback.name, Decimal("300000"),
        fallback.sort_order, "2026-07", user.id, category_id=fallback.category_id,
        annual_plan_item_id=fallback.annual_plan_item_id,
    )
    assert saved.id is not None
    assert saved.annual_plan_item_id == annual_item.id

    # Rename the annual plan item a couple of times, keeping the id stable (as the frontend does).
    for new_name in ("재산세(변경1)", "재산세(변경2)"):
        annual_plan_service.upsert_item(
            db, annual_item.id, 2026, "irregular", None, new_name, None, 0, user.id, "2026-01", "2026-12",
            monthly_targets=[{"year_month": "2026-07", "target_amount": Decimal("300000")}],
        )

    items = cashflow_plan_service.list_items_with_annual_fallback(db, "2026-07")
    assert len(items) == 1
    assert items[0].id == saved.id
