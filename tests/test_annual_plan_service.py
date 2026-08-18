from datetime import date
from decimal import Decimal

from app.models.annual_plan_item_monthly_target import AnnualPlanItemMonthlyTarget
from app.services import annual_plan_service, transaction_service


def _monthly(*, jan=None, feb=None, mar=None) -> list[dict]:
    targets = []
    if jan is not None:
        targets.append({"year_month": "2026-01", "target_amount": Decimal(jan)})
    if feb is not None:
        targets.append({"year_month": "2026-02", "target_amount": Decimal(feb)})
    if mar is not None:
        targets.append({"year_month": "2026-03", "target_amount": Decimal(mar)})
    return targets


def test_upsert_creates_new_item_with_monthly_targets(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "월급",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="3000000", feb="3000000"),
    )

    assert item.id is not None
    assert item.year == 2026
    assert item.section == "income"
    assert item.name == "월급"
    assert item.start_month == "2026-01"
    assert item.end_month == "2026-12"
    assert len(item.monthly_targets) == 2
    assert {mt.year_month for mt in item.monthly_targets} == {"2026-01", "2026-02"}


def test_upsert_updates_existing_item_and_monthly_targets_preserve_others(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "variable",
        None,
        "식비",
        food.id,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="500000", feb="500000"),
    )

    updated = annual_plan_service.upsert_item(
        db,
        item.id,
        2026,
        "variable",
        None,
        "식비(수정)",
        food.id,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="600000", feb="500000"),
    )

    assert updated.id == item.id
    assert updated.name == "식비(수정)"
    jan = next(mt for mt in updated.monthly_targets if mt.year_month == "2026-01")
    assert jan.target_amount == Decimal("600000")


def test_upsert_drops_removed_months(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "부수입",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="100000", feb="100000"),
    )

    updated = annual_plan_service.upsert_item(
        db,
        item.id,
        2026,
        "income",
        None,
        "부수입",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="100000"),
    )

    assert len(updated.monthly_targets) == 1
    assert updated.monthly_targets[0].year_month == "2026-01"


def test_upsert_narrows_period_and_drops_out_of_range_months(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "상여금",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="100000", feb="100000", mar="100000"),
    )

    updated = annual_plan_service.upsert_item(
        db,
        item.id,
        2026,
        "income",
        None,
        "상여금",
        None,
        0,
        user.id,
        "2026-01",
        "2026-02",
        monthly_targets=_monthly(jan="100000", feb="100000"),
    )

    assert updated.start_month == "2026-01"
    assert updated.end_month == "2026-02"
    assert {mt.year_month for mt in updated.monthly_targets} == {"2026-01", "2026-02"}


def test_delete_item_cascades_monthly_targets(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "월급",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="3000000"),
    )
    item_id = item.id

    annual_plan_service.delete_item(db, item_id)

    assert db.get(annual_plan_service.AnnualPlanItem, item_id) is None
    remaining = db.query(AnnualPlanItemMonthlyTarget).filter(AnnualPlanItemMonthlyTarget.item_id == item_id).count()
    assert remaining == 0


def test_delete_item_is_noop_when_missing(seeded_db):
    db = seeded_db["db"]
    annual_plan_service.delete_item(db, 1999)  # should not raise


def test_list_items_filters_by_year_and_section(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    annual_plan_service.upsert_item(db, None, 2025, "income", None, "작년 수입", None, 0, user.id, "2025-01", "2025-12")
    annual_plan_service.upsert_item(db, None, 2026, "income", None, "올해 수입", None, 0, user.id, "2026-01", "2026-12")
    annual_plan_service.upsert_item(db, None, 2026, "fixed", None, "올해 고정지출", None, 0, user.id, "2026-01", "2026-12")

    items_2026 = annual_plan_service.list_items(db, 2026)
    assert {i.name for i in items_2026} == {"올해 수입", "올해 고정지출"}

    income_2026 = annual_plan_service.list_items(db, 2026, section="income")
    assert [i.name for i in income_2026] == ["올해 수입"]


def test_item_to_out_includes_derived_annual_target_and_category(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    item = annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "variable",
        None,
        "식비",
        food.id,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="500000", feb="500000"),
    )

    out = annual_plan_service.item_to_out(item)

    assert out["annual_target"] == Decimal("1000000")
    assert out["category_name"] == "식비"
    assert out["start_month"] == "2026-01"
    assert out["end_month"] == "2026-12"


def test_section_summary_derives_target_from_item_sum(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "월급",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="3000000", feb="3000000"),
    )
    annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "부수입",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="500000", feb="500000"),
    )

    summary = annual_plan_service.section_summary(db, 2026, "income", today=date(2026, 2, 28))

    assert summary["elapsed_months"] == 2
    assert summary["target_to_date"] == Decimal("7000000")  # (3M+0.5M)*2
    assert summary["annual_target"] == Decimal("7000000")  # 1~12월 전체 합 — 3~12월은 미입력이라 0


def test_section_summary_annual_target_includes_months_beyond_elapsed(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "월급",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="1000000", mar="1000000"),
    )

    summary = annual_plan_service.section_summary(db, 2026, "income", today=date(2026, 1, 31))

    assert summary["elapsed_months"] == 1
    assert summary["target_to_date"] == Decimal("1000000")  # 1월치만
    assert summary["annual_target"] == Decimal("2000000")  # 1월 + 3월, 경과 여부와 무관하게 전체 합


def test_section_summary_income_actual_from_transactions(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    annual_plan_service.upsert_item(
        db,
        None,
        2026,
        "income",
        None,
        "월급",
        None,
        0,
        user.id,
        "2026-01",
        "2026-12",
        monthly_targets=_monthly(jan="3000000", feb="3000000"),
    )
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 1, 15))
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("3000000"), date(2026, 2, 15))
    # 아직 오지 않은 3월 거래 — today가 2월이므로 집계에 포함되면 안 된다
    transaction_service.create_transaction(db, user.id, salary.id, "income", Decimal("9000000"), date(2026, 3, 1))

    summary = annual_plan_service.section_summary(db, 2026, "income", today=date(2026, 2, 28))

    assert summary["actual"] == Decimal("6000000")
    assert summary["pct"] == 100.0
    assert summary["status"] == "ok"
    mar = next(m for m in summary["monthly"] if m["year_month"] == "2026-03")
    assert mar["actual"] is None


def test_section_summary_expense_over_target_is_critical(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    annual_plan_service.upsert_item(
        db, None, 2026, "variable", None, "식비", food.id, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="100000")
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("200000"), date(2026, 1, 10))

    summary = annual_plan_service.section_summary(db, 2026, "variable", today=date(2026, 1, 31))

    assert summary["actual"] == Decimal("200000")
    assert summary["target_to_date"] == Decimal("100000")
    assert summary["status"] == "critical"


def test_section_summary_income_under_target_is_critical(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    annual_plan_service.upsert_item(
        db, None, 2026, "income", None, "월급", None, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="1000000")
    )

    summary = annual_plan_service.section_summary(db, 2026, "income", today=date(2026, 1, 31))

    assert summary["actual"] == Decimal("0")
    assert summary["status"] == "critical"


def test_section_summary_future_year_has_null_pct(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    annual_plan_service.upsert_item(
        db, None, 2027, "income", None, "월급", None, 0, user.id, "2027-01", "2027-12", monthly_targets=_monthly(jan="1000000")
    )

    summary = annual_plan_service.section_summary(db, 2027, "income", today=date(2026, 6, 1))

    assert summary["elapsed_months"] == 0
    assert summary["actual"] == Decimal("0")
    assert summary["pct"] is None
    assert summary["status"] is None


def test_section_summary_empty_section_has_zero_targets(seeded_db):
    db = seeded_db["db"]
    summary = annual_plan_service.section_summary(db, 2026, "fixed", today=date(2026, 3, 1))
    assert summary["target_to_date"] == Decimal("0")
    assert all(m["target_amount"] == Decimal("0.00") for m in summary["monthly"])


def test_summary_for_year_includes_all_four_sections(seeded_db):
    db = seeded_db["db"]
    summary = annual_plan_service.summary_for_year(db, 2026, today=date(2026, 1, 1))
    assert set(summary.keys()) == {"income", "fixed", "variable", "irregular", "expense_total", "available"}


def test_summary_for_year_computes_expense_total_and_available(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    annual_plan_service.upsert_item(
        db, None, 2026, "income", None, "월급", None, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="3000000")
    )
    annual_plan_service.upsert_item(
        db, None, 2026, "fixed", None, "월세", None, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="1000000")
    )
    annual_plan_service.upsert_item(
        db, None, 2026, "variable", None, "식비", food.id, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="500000")
    )
    annual_plan_service.upsert_item(
        db, None, 2026, "irregular", None, "경조사", None, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="200000")
    )

    summary = annual_plan_service.summary_for_year(db, 2026, today=date(2026, 1, 1))

    assert summary["expense_total"] == Decimal("1700000")  # 1M + 0.5M + 0.2M
    assert summary["available"] == Decimal("1300000")  # 3M - 1.7M


def test_category_budget_vs_actual_sums_item_targets_by_category(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    annual_plan_service.upsert_item(
        db, None, 2026, "variable", None, "식비1", food.id, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="300000")
    )
    annual_plan_service.upsert_item(
        db, None, 2026, "variable", None, "식비2", food.id, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="200000")
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("400000"), date(2026, 1, 10))

    rows = annual_plan_service.category_budget_vs_actual(db, 2026)

    food_row = next(r for r in rows if r["category_id"] == food.id)
    assert food_row["budget"] == Decimal("500000")  # 300000 + 200000
    assert food_row["actual"] == Decimal("400000")
    assert food_row["status"] == "ok"

    rent_row = next(r for r in rows if r["category_id"] == rent.id)
    assert rent_row["budget"] == Decimal("0")
    assert rent_row["actual"] == Decimal("0")
    assert rent_row["status"] == "ok"


def test_category_budget_vs_actual_over_budget_is_critical(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    annual_plan_service.upsert_item(
        db, None, 2026, "variable", None, "식비", food.id, 0, user.id, "2026-01", "2026-12", monthly_targets=_monthly(jan="100000")
    )
    transaction_service.create_transaction(db, user.id, food.id, "expense", Decimal("200000"), date(2026, 1, 10))

    rows = annual_plan_service.category_budget_vs_actual(db, 2026)

    food_row = next(r for r in rows if r["category_id"] == food.id)
    assert food_row["status"] == "critical"
