"""CSV 가져오기 입력 검증 — 화면 입력의 스키마(KrwAmount)를 거치지 않는 경로라 여기서 막는다."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.exc import DataError

from app.errors import PayloadTooLargeError
from app.models.category import Category
from app.models.transaction import Transaction
from app.services import transaction_import_service, transaction_service


def _import(seeded_db, csv_text, **kw):
    return transaction_import_service.import_csv(seeded_db["db"], csv_text, seeded_db["user"].id, **kw)


@pytest.mark.parametrize(
    "raw",
    ["NaN", "nan", "Infinity", "-Infinity", "sNaN", "10000000000", "1e10", "100.555"],
)
def test_import_skips_amounts_that_cannot_be_stored(seeded_db, raw):
    result = _import(seeded_db, f"2026-07-01,지출,식비,{raw},점심\n")

    assert result["created"] == 0
    assert result["skipped"][0]["line"] == 1
    assert seeded_db["db"].query(Transaction).count() == 0


def test_import_skips_negative_amount_and_explains_refunds(seeded_db):
    result = _import(seeded_db, "2026-07-01,지출,식비,-5000,취소\n2026-07-02,지출,식비,3000,점심\n")

    assert result["created"] == 1
    assert [s["line"] for s in result["skipped"]] == [1]
    assert "환불" in result["skipped"][0]["reason"]


@pytest.mark.parametrize("raw,expected", [("0", "0"), ("9999999999.99", "9999999999.99"), ("1,000.50원", "1000.50")])
def test_import_accepts_amounts_at_the_limits(seeded_db, raw, expected):
    result = _import(seeded_db, f'2026-07-01,지출,식비,"{raw}",점심\n')

    assert result["created"] == 1
    assert seeded_db["db"].query(Transaction).one().amount == Decimal(expected)


def test_import_skips_merged_group_whose_sum_exceeds_the_limit(seeded_db):
    result = _import(seeded_db, "2026-07-01,지출,식비,9999999999,점심\n2026-07-01,지출,식비,9999999999,점심\n")

    assert result["created"] == 0
    assert [s["line"] for s in result["skipped"]] == [1, 2]
    assert "합친 금액" in result["skipped"][0]["reason"]


def test_import_explicit_category_of_other_kind_is_not_used(seeded_db):
    """지출 카테고리가 붙은 수입 거래를 만들면 안 된다."""
    result = _import(seeded_db, "2026-07-01,수입,식비,5000,입금\n")

    assert result["created"] == 0
    assert "수입 카테고리 '식비'" in result["skipped"][0]["reason"]


def test_import_same_category_name_in_both_kinds_picks_matching_kind(seeded_db):
    db = seeded_db["db"]
    expense_etc = Category(name="기타", kind="expense", type="variable", color="#000", sort_order=0)
    income_etc = Category(name="기타", kind="income", type="fixed", color="#000", sort_order=0)
    db.add_all([expense_etc, income_etc])
    db.commit()

    _import(seeded_db, "2026-07-01,지출,기타,1000,가\n2026-07-02,수입,기타,2000,나\n")

    by_type = {tx.type: tx.category_id for tx in db.query(Transaction)}
    assert by_type == {"expense": expense_etc.id, "income": income_etc.id}


def test_import_inactive_category_falls_back_to_inference(seeded_db):
    db, food = seeded_db["db"], seeded_db["food"]
    food.is_active = False
    db.commit()

    result = _import(seeded_db, "2026-07-01,지출,식비,1000,처음보는가게\n")

    assert result["created"] == 0
    assert "식비" in result["skipped"][0]["reason"]


def test_import_database_error_reason_does_not_expose_sql(seeded_db):
    db = seeded_db["db"]
    real_flush = db.flush

    def flaky_flush(*args, **kwargs):
        if db.new:
            raise DataError("INSERT INTO household.transactions (secret_column)", {}, Exception("orig"))
        return real_flush(*args, **kwargs)

    with patch.object(db, "flush", side_effect=flaky_flush):
        result = _import(seeded_db, "2026-07-01,지출,식비,1000,점심\n")

    assert result["created"] == 0
    reason = result["skipped"][0]["reason"]
    assert "secret_column" not in reason
    assert "INSERT" not in reason


def test_import_rejects_file_over_row_limit(seeded_db):
    with patch.object(transaction_import_service, "MAX_IMPORT_ROWS", 2):
        with pytest.raises(PayloadTooLargeError):
            _import(seeded_db, "2026-07-01,지출,식비,1,가\n2026-07-02,지출,식비,1,나\n2026-07-03,지출,식비,1,다\n")


def test_import_row_limit_excludes_header_and_blank_rows(seeded_db):
    with patch.object(transaction_import_service, "MAX_IMPORT_ROWS", 2):
        result = _import(seeded_db, "날짜,구분,카테고리,금액,메모\n2026-07-01,지출,식비,1,가\n\n2026-07-02,지출,식비,1,나\n")

    assert result["created"] == 2


def test_create_transaction_rejects_category_of_other_kind(seeded_db):
    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]

    with pytest.raises(transaction_service.InvalidCategoryKindError):
        transaction_service.create_transaction(
            db, user_id=user.id, category_id=food.id, type_="income", amount=Decimal("1000"), transaction_date=date(2026, 7, 1)
        )
    with pytest.raises(transaction_service.InvalidCategoryKindError):
        transaction_service.create_transaction(
            db, user_id=user.id, category_id=salary.id, type_="expense", amount=Decimal("1000"), transaction_date=date(2026, 7, 1)
        )


def test_create_transaction_rejects_missing_category(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    with pytest.raises(transaction_service.InvalidCategoryKindError):
        transaction_service.create_transaction(
            db, user_id=user.id, category_id=99999, type_="expense", amount=Decimal("1000"), transaction_date=date(2026, 7, 1)
        )


def test_update_transaction_rejects_type_change_that_mismatches_category(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx = transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("1000"), transaction_date=date(2026, 7, 1)
    )

    with pytest.raises(transaction_service.InvalidCategoryKindError):
        transaction_service.update_transaction(db, tx.id, type="income")


def test_recurring_rejects_category_of_other_kind(seeded_db):
    """잘못 등록되면 예약 잡이 예외를 삼키고 매번 거래를 만들지 못한다."""
    from app.services import recurring_service

    db, user, food, salary = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["salary"]

    with pytest.raises(transaction_service.InvalidCategoryKindError):
        recurring_service.create_recurring(
            db, "월급", food.id, Decimal("1000"), "monthly", date(2026, 7, 1), user.id, type_="income"
        )

    recurring = recurring_service.create_recurring(
        db, "월세", food.id, Decimal("1000"), "monthly", date(2026, 7, 1), user.id
    )
    with pytest.raises(transaction_service.InvalidCategoryKindError):
        recurring_service.update_recurring(db, recurring.id, category_id=salary.id)
