from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.errors import InvalidInputError
from app.models.category import Category
from app.services import (
    account_service,
    transaction_import_service,
    transaction_service,
    transaction_trend_service,
)
from app.services.growlio_client import GrowlioNotConfiguredError


def test_export_csv_round_trips_through_import(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("12000"), transaction_date=date(2026, 7, 5), description="점심")
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="income", amount=Decimal("3000000"), transaction_date=date(2026, 7, 1), description="월급")

    transactions = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    csv_text = transaction_import_service.export_csv(transactions)

    assert "점심" in csv_text
    assert "지출" in csv_text and "수입" in csv_text

    # wipe and re-import to prove the exported format is importable
    for tx in transactions:
        transaction_service.delete_transaction(db, tx.id)
    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert result["skipped"] == []
    reimported = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    assert len(reimported) == 2


def test_import_csv_returns_created_ids_for_undo(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,10000,점심\n"
        "2026-07-06,지출,식비,5000,저녁\n"
    )

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert len(result["created_ids"]) == 2
    created = {tx.id for tx in transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))}
    assert set(result["created_ids"]) == created


def test_import_csv_skips_unknown_category_and_reports_reason(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "날짜,구분,카테고리,금액,메모\n2026-07-05,지출,없는카테고리,10000,test\n"

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 0
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["line"] == 1


def test_import_csv_skips_malformed_amount_but_keeps_valid_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,not-a-number,broken\n"
        "2026-07-06,지출,식비,5000,ok\n"
    )

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["line"] == 1


def _expense(db, user, category, description, day=1):
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=category.id, type_="expense", amount=Decimal("1000"),
        transaction_date=date(2026, 6, day), description=description,
    )


def _category_of(db, description):
    txs = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    return next(tx.category.name for tx in txs if tx.description == description)


def test_import_blank_category_uses_most_frequent_category_for_same_memo(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    _expense(db, user, food, "편의점", day=1)
    _expense(db, user, food, "편의점", day=2)
    _expense(db, user, rent, "편의점", day=3)

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,편의점\n", user.id)

    assert result["created"] == 1
    assert _category_of(db, "편의점") == "식비"
    assert result["auto_categorized"] == [{"line": 1, "description": "편의점", "category_name": "식비", "source": "history"}]


def test_import_tie_in_memo_history_prefers_most_recent(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    _expense(db, user, food, "관리비", day=1)
    _expense(db, user, rent, "관리비", day=20)

    transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,관리비\n", user.id)

    assert _category_of(db, "관리비") == "주거비"


def test_import_explicit_category_is_not_overridden_by_memo(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _expense(db, user, food, "꽃다발")

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,경조사비,5000,꽃다발\n", user.id)

    assert _category_of(db, "꽃다발") == "경조사비"
    assert result["auto_categorized"] == []


def test_import_unknown_category_name_falls_back_to_memo(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _expense(db, user, food, "점심")

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,외식,5000,점심\n", user.id)

    assert result["created"] == 1
    assert _category_of(db, "점심") == "식비"


def test_import_memo_history_of_other_type_is_ignored(seeded_db):
    db, user, salary = seeded_db["db"], seeded_db["user"], seeded_db["salary"]
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=salary.id, type_="income", amount=Decimal("100"),
        transaction_date=date(2026, 6, 1), description="이자",
    )

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,이자\n", user.id)

    assert result["created"] == 0
    assert "메모로도 추론하지 못했습니다" in result["skipped"][0]["reason"]


def test_import_partial_memo_match_uses_longest_known_memo(seeded_db):
    db, user, food, rent = seeded_db["db"], seeded_db["user"], seeded_db["food"], seeded_db["rent"]
    _expense(db, user, food, "스타벅스")
    _expense(db, user, rent, "스타")

    transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,스타벅스 강남점\n", user.id)

    assert _category_of(db, "스타벅스 강남점") == "식비"


def test_import_memo_match_ignores_case_and_spacing(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    _expense(db, user, food, "GS25  역삼")

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,gs25 역삼\n", user.id)

    assert result["created"] == 1
    assert _category_of(db, "gs25 역삼") == "식비"


def test_import_learns_from_earlier_rows_in_same_file(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "2026-07-05,지출,주거비,5000,세탁소\n2026-07-06,지출,,5000,세탁소\n"

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 2
    assert [r["line"] for r in result["auto_categorized"]] == [2]


def test_import_blank_category_without_memo_history_is_skipped(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,처음보는가게\n", user.id)

    assert result["created"] == 0
    assert result["skipped"][0]["reason"] == "카테고리가 비어 있고 메모로도 추론하지 못했습니다"


@pytest.mark.parametrize(
    "raw",
    ["2026-07-05", "2026.07.05", "2026.7.5", "2026/07/05", "2026. 07. 05.", "20260705", "2026.07.05 13:24", " 2026.07.05 "],
)
def test_parse_date_accepts_bank_export_formats(raw):
    assert transaction_import_service._parse_date(raw) == date(2026, 7, 5)


@pytest.mark.parametrize("raw", ["07.05.2026", "2026.13.01", "어제", ""])
def test_parse_date_rejects_unreadable_dates(raw):
    with pytest.raises(ValueError):
        transaction_import_service._parse_date(raw)


@pytest.mark.parametrize("raw", ["12000", "12,000", "12,000원", " ₩12,000 ", "12000.50"])
def test_parse_amount_strips_separators(raw):
    assert transaction_import_service._parse_amount(raw) in (Decimal("12000"), Decimal("12000.50"))


def test_import_accepts_dotted_dates_and_comma_amounts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = transaction_import_service.import_csv(db, '2026.07.05,지출,식비,"12,000",점심\n', user.id)

    assert result["skipped"] == []
    assert [(tx.transaction_date, tx.amount) for tx in _july(db)] == [(date(2026, 7, 5), Decimal("12000"))]


def test_import_uses_merchant_keyword_when_no_history(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,스타벅스 역삼점\n", user.id)

    assert result["created"] == 1
    assert result["auto_categorized"][0]["category_name"] == "식비"
    assert result["auto_categorized"][0]["source"] == "keyword"


def test_import_history_beats_merchant_keyword(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    _expense(db, user, rent, "스타벅스 역삼점")

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,스타벅스 역삼점\n", user.id)

    assert result["auto_categorized"][0]["category_name"] == "주거비"
    assert result["auto_categorized"][0]["source"] == "history"


def test_keyword_category_prefers_longest_keyword_and_skips_missing_category(seeded_db):
    db = seeded_db["db"]
    by_name = {c.name: c for c in db.query(Category).all()}

    # "쿠팡이츠"(식비)가 "쿠팡"(장보기 — seeded_db엔 없음)보다 길다
    assert transaction_import_service._keyword_category("쿠팡이츠 주문", by_name).name == "식비"
    # 장보기 카테고리가 없는 가구라 키워드는 무시된다
    assert transaction_import_service._keyword_category("이마트 성수점", by_name) is None


def test_import_unmatched_rows_go_to_fallback_category(seeded_db):
    db, user, events = seeded_db["db"], seeded_db["user"], seeded_db["events"]
    csv_text = "2026-07-05,지출,,5000,처음보는가게\n2026-07-06,수입,,5000,처음보는입금\n"

    result = transaction_import_service.import_csv(db, csv_text, user.id, fallback_category_id=events.id)

    assert result["created"] == 1
    assert result["auto_categorized"] == [
        {"line": 1, "description": "처음보는가게", "category_name": "경조사비", "source": "fallback"}
    ]
    # 지출 기본 카테고리는 수입 행에 쓰지 않는다
    assert [s["line"] for s in result["skipped"]] == [2]


def test_import_unknown_fallback_category_is_rejected(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    with pytest.raises(InvalidInputError):
        transaction_import_service.import_csv(db, "2026-07-05,지출,,5000,x\n", user.id, fallback_category_id=99999)


def _july(db):
    return transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))


def test_import_merges_same_day_similar_memo_rows(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "2026-07-05,지출,식비,8000,스타벅스\n"
        "2026-07-05,지출,식비,4000,스타벅스 강남점\n"
        "2026-07-05,지출,식비,3000, 스타벅스 \n"
    )

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert [(tx.description, tx.amount) for tx in _july(db)] == [("스타벅스", Decimal("15000"))]
    assert result["merged"] == [{"lines": [1, 2, 3], "description": "스타벅스", "amount": Decimal("15000")}]


@pytest.mark.parametrize(
    "second_row",
    [
        "2026-07-06,지출,식비,4000,점심",  # 다른 날
        "2026-07-05,수입,식비,4000,점심",  # 다른 구분
        "2026-07-05,지출,주거비,4000,점심",  # 다른 카테고리
        "2026-07-05,지출,식비,4000,저녁",  # 다른 메모
    ],
)
def test_import_does_not_merge_rows_that_differ(seeded_db, second_row):
    db, user = seeded_db["db"], seeded_db["user"]

    result = transaction_import_service.import_csv(db, f"2026-07-05,지출,식비,8000,점심\n{second_row}\n", user.id)

    assert result["created"] == 2
    assert result["merged"] == []


def test_import_does_not_merge_blank_memos(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,식비,8000,\n2026-07-05,지출,식비,4000,\n", user.id)

    assert result["created"] == 2


def test_import_merges_inferred_category_with_explicit_one(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "2026-07-05,지출,식비,8000,점심\n2026-07-05,지출,,4000,점심\n"

    result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert _july(db)[0].amount == Decimal("12000")
    assert [r["line"] for r in result["auto_categorized"]] == [2]


def test_import_skips_row_already_saved_with_similar_memo(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("8000"),
        transaction_date=date(2026, 7, 5), description="스타벅스",
    )

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,식비,8000,스타벅스 강남점\n", user.id)

    assert result["created"] == 0
    assert result["skipped"][0]["reason"] == transaction_import_service.DUPLICATE_REASON
    assert len(_july(db)) == 1


def test_import_same_memo_with_different_amount_is_not_duplicate(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("8000"),
        transaction_date=date(2026, 7, 5), description="점심",
    )

    result = transaction_import_service.import_csv(db, "2026-07-05,지출,식비,9000,점심\n", user.id)

    assert result["created"] == 1


def test_reimporting_same_csv_creates_nothing_twice(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = "2026-07-05,지출,식비,8000,점심\n2026-07-05,지출,식비,4000,점심\n2026-07-06,지출,식비,5000,저녁\n"

    first = transaction_import_service.import_csv(db, csv_text, user.id)
    second = transaction_import_service.import_csv(db, csv_text, user.id)

    assert first["created"] == 2
    assert second["created"] == 0
    assert [s["line"] for s in second["skipped"]] == [1, 2, 3]
    assert len(_july(db)) == 2


def test_import_row_db_error_is_isolated_and_does_not_abort_whole_import(seeded_db):
    """한 행의 db.flush()가 DB 오류(정밀도 초과 등)를 내도 SAVEPOINT 롤백으로 그 행만 skip하고
    나머지 행과 최종 commit은 정상 진행된다 — 예전에는 세션이 오염돼 import 전체가 실패했다."""
    db, user = seeded_db["db"], seeded_db["user"]
    csv_text = (
        "날짜,구분,카테고리,금액,메모\n"
        "2026-07-05,지출,식비,10000,boom\n"
        "2026-07-06,지출,식비,5000,ok\n"
    )
    real_flush = db.flush

    def flaky_flush(*args, **kwargs):
        # "boom" 행을 flush할 때만 DB 오류를 시뮬레이션한다 (정밀도 초과 등을 흉내).
        if any(getattr(obj, "description", None) == "boom" for obj in db.new):
            raise SQLAlchemyError("simulated data error")
        return real_flush(*args, **kwargs)

    with patch.object(db, "flush", side_effect=flaky_flush):
        result = transaction_import_service.import_csv(db, csv_text, user.id)

    assert result["created"] == 1
    assert len(result["skipped"]) == 1
    assert "simulated data error" in result["skipped"][0]["reason"]
    reimported = transaction_service.list_transactions(db, date(2026, 7, 1), date(2026, 7, 31))
    assert [tx.description for tx in reimported] == ["ok"]


def test_account_balance_reflects_initial_balance_plus_transactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    account = account_service.create_account(db, "현금", "cash", Decimal("100000"))

    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="income", amount=Decimal("50000"), transaction_date=date(2026, 7, 1), account_id=account.id
    )
    transaction_service.create_transaction(
        db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("20000"), transaction_date=date(2026, 7, 2), account_id=account.id
    )
    # a transaction on a *different* account (or no account) must not affect this balance
    transaction_service.create_transaction(db, user_id=user.id, category_id=food.id, type_="expense", amount=Decimal("999999"), transaction_date=date(2026, 7, 3))

    balance = account_service.current_balance(db, account)

    assert balance == Decimal("130000")  # 100000 + 50000 - 20000


def test_deactivated_account_excluded_from_active_listing(seeded_db):
    db = seeded_db["db"]
    account = account_service.create_account(db, "카드", "card", Decimal("0"))

    account_service.deactivate_account(db, account.id)

    assert account.id not in [a.id for a in account_service.list_accounts(db, active_only=True)]
    assert account.id in [a.id for a in account_service.list_accounts(db, active_only=False)]


def test_yearly_monthly_breakdown_covers_all_twelve_months_in_order(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("800000"), transaction_date=date(2026, 3, 1))
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("800000"), transaction_date=date(2026, 11, 1))

    monthly = transaction_trend_service.yearly_monthly_breakdown(db, 2026)

    assert len(monthly) == 12
    assert [row["year_month"] for row in monthly] == [f"2026-{m:02d}" for m in range(1, 13)]
    assert monthly[2]["expense"] == Decimal("800000")  # March
    assert monthly[10]["expense"] == Decimal("800000")  # November
    assert monthly[0]["expense"] == Decimal("0")  # January untouched


def test_list_growlio_bank_accounts_filters_to_bank_type_only(seeded_db):
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        accounts = account_service.list_growlio_bank_accounts("token")

    assert [a["id"] for a in accounts] == ["growlio-acc-1"]


def test_import_from_growlio_creates_one_account_per_bank_account(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[
            {"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1500000.0},
            {"id": "growlio-acc-2", "name": "키움 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 5000000.0},
        ],
    ):
        created = account_service.import_from_growlio(db, ["growlio-acc-1", "growlio-acc-2"], "token", user.id)

    assert len(created) == 1
    assert created[0].growlio_account_id == "growlio-acc-1"
    assert created[0].account_type == "bank"
    assert created[0].initial_balance == Decimal("1500000.0")
    # 가져오기를 실행한 사람 = 그 growlio 계정의 실제 소유자
    assert created[0].owner_user_id == user.id


def test_import_from_growlio_skips_already_linked_accounts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    account_service.create_account(db, "기존계좌", "bank", Decimal("0"))
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0}],
    ):
        first = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)
        second = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)

    assert len(first) == 1
    assert len(second) == 0


def test_import_from_growlio_propagates_not_configured_error(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        side_effect=GrowlioNotConfiguredError("not configured"),
    ):
        with pytest.raises(GrowlioNotConfiguredError):
            account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)


def test_deactivate_account_clears_growlio_link(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with patch(
        "app.services.account_service.growlio_client.fetch_account_balances",
        return_value=[{"id": "growlio-acc-1", "name": "국민은행 입출금", "asset_type": "BANK_ACCOUNT", "current_value_krw": 1.0}],
    ):
        created = account_service.import_from_growlio(db, ["growlio-acc-1"], "token", user.id)
    account = created[0]

    account_service.deactivate_account(db, account.id)
    db.refresh(account)

    assert account.is_active is False
    assert account.growlio_account_id is None


def test_yearly_totals_excludes_other_years(seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("800000"), transaction_date=date(2026, 6, 1))
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("500000"), transaction_date=date(2025, 12, 31))
    transaction_service.create_transaction(db, user_id=user.id, category_id=rent.id, type_="expense", amount=Decimal("500000"), transaction_date=date(2027, 1, 1))

    totals = transaction_trend_service.yearly_totals(db, 2026)

    assert totals["expense"] == Decimal("800000")


def test_decode_upload_accepts_utf8_bom_and_cp949():
    assert transaction_import_service.decode_upload("날짜,구분".encode("utf-8-sig")) == "날짜,구분"
    assert transaction_import_service.decode_upload("날짜,구분".encode("cp949")) == "날짜,구분"


def test_decode_upload_rejects_unreadable_encoding_and_oversized(monkeypatch):
    from app.errors import InvalidInputError, PayloadTooLargeError

    with pytest.raises(InvalidInputError):
        transaction_import_service.decode_upload(b"\xff\xfe\xfa\xfb")
    monkeypatch.setattr(transaction_import_service.settings, "max_upload_size_mb", 1)
    with pytest.raises(PayloadTooLargeError):
        transaction_import_service.decode_upload(b"a" * (1024 * 1024 + 1))
