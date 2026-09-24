from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models.user import User
from app.services import account_service, loan_service, net_worth_service, savings_product_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError


def _seed_balances(db):
    account_service.create_account(db, "주거래통장", "bank", Decimal("1000000"))
    savings_product_service.create_product(db, "적금", Decimal("2000000"), Decimal("300000"))
    loan_service.create_loan(db, "신용대출", Decimal("500000"), Decimal("50000"), None, None, None, None)


def test_compute_current_aggregates_accounts_savings_loans(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    breakdown = net_worth_service.compute_current(db)

    assert breakdown["accounts_total"] == Decimal("1000000")
    assert breakdown["savings_total"] == Decimal("2000000")
    assert breakdown["loans_total"] == Decimal("500000")
    assert breakdown["net_worth"] == Decimal("2500000")


def test_record_snapshot_upserts_by_month(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    first = net_worth_service.record_snapshot(db, today=date(2026, 7, 1))
    assert first.year_month == "2026-07"
    assert first.net_worth == Decimal("2500000")

    savings_product_service.create_product(db, "예금", Decimal("1000000"), Decimal("0"))
    second = net_worth_service.record_snapshot(db, today=date(2026, 7, 15))

    history = net_worth_service.list_history(db)
    assert len(history) == 1
    assert second.id == first.id
    assert second.net_worth == Decimal("3500000")


def test_list_history_returns_ascending_order(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)

    net_worth_service.record_snapshot(db, today=date(2026, 5, 1))
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))

    history = net_worth_service.list_history(db, months=2)

    assert [row.year_month for row in history] == ["2026-06", "2026-07"]


def test_savings_delta_returns_change_between_consecutive_snapshots(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))  # savings_total = 2,000,000

    savings_product_service.create_product(db, "예금", Decimal("500000"), Decimal("0"))
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))  # savings_total = 2,500,000

    assert net_worth_service.savings_delta(db, "2026-07") == Decimal("500000")


def test_savings_delta_none_when_previous_snapshot_missing(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 7, 1))

    assert net_worth_service.savings_delta(db, "2026-07") is None


def test_savings_delta_none_when_current_snapshot_missing(seeded_db):
    db = seeded_db["db"]
    _seed_balances(db)
    net_worth_service.record_snapshot(db, today=date(2026, 6, 1))

    assert net_worth_service.savings_delta(db, "2026-07") is None


def test_compute_growlio_unlinked_excludes_linked_and_sums_by_category(seeded_db):
    db = seeded_db["db"]
    linked_account = account_service.create_account(db, "월급통장", "bank", Decimal("0"))
    linked_account.growlio_account_id = "growlio-bank-1"
    linked_product = savings_product_service.create_product(
        db, "적금", Decimal("0"), Decimal("0"), "investment"
    )
    linked_product.growlio_account_id = "growlio-inv-1"
    db.commit()

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-bank-1", "name": "연동됨", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100.0},
                {"id": "growlio-bank-2", "name": "미연동 은행", "asset_type": "BANK_ACCOUNT", "current_value_krw": 200000.0},
                {"id": "growlio-inv-1", "name": "연동됨", "asset_type": "STOCK_KIS", "current_value_krw": 300.0},
                {"id": "growlio-inv-2", "name": "미연동 증권", "asset_type": "STOCK_KIWOOM", "current_value_krw": 400000.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[
                {
                    "id": "growlio-re-1",
                    "name": "미연동 부동산",
                    "market_value_krw": 5000000.0,
                    "mortgage_balance_krw": 1000000.0,
                },
            ],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["bank_total"] == Decimal("200000")
    assert breakdown["investment_total"] == Decimal("400000")
    assert breakdown["real_estate_total"] == Decimal("5000000")
    assert breakdown["real_estate_loan_total"] == Decimal("1000000")
    assert breakdown["net_total"] == Decimal("4600000")
    assert breakdown["item_count"] == 3


def test_compute_growlio_unlinked_does_not_double_count_real_estate(seeded_db):
    db = seeded_db["db"]

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-re-1", "name": "부동산", "asset_type": "REAL_ESTATE", "current_value_krw": 4000000.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[
                {"id": "growlio-re-1", "name": "부동산", "market_value_krw": 5000000.0, "mortgage_balance_krw": 0},
            ],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["bank_total"] == Decimal("0")
    assert breakdown["investment_total"] == Decimal("0")
    assert breakdown["real_estate_total"] == Decimal("5000000")
    assert breakdown["item_count"] == 1


def test_compute_growlio_unlinked_returns_zero_when_everything_already_linked(seeded_db):
    db = seeded_db["db"]
    linked_account = account_service.create_account(db, "월급통장", "bank", Decimal("0"))
    linked_account.growlio_account_id = "growlio-bank-1"
    db.commit()

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            return_value=[
                {"id": "growlio-bank-1", "name": "연동됨", "asset_type": "BANK_ACCOUNT", "current_value_krw": 100.0},
            ],
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            return_value=[],
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0


def test_compute_growlio_unlinked_returns_zero_when_growlio_unreachable(seeded_db):
    db = seeded_db["db"]

    # 두 growlio 호출이 동시에 나가므로(net_worth_service.compute_growlio_unlinked), 같은 서버가
    # 대상인 실패 시나리오를 재현하려면 둘 다 mock해야 한다 — 하나만 mock하면 나머지가 실제
    # httpx 호출을 시도해 테스트가 느려지거나 불안정해진다.
    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0


def test_compute_growlio_unlinked_returns_zero_when_not_configured(seeded_db):
    db = seeded_db["db"]

    with (
        patch(
            "app.services.net_worth_service.growlio_client.fetch_account_balances",
            side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
        ),
        patch(
            "app.services.net_worth_service.growlio_client.fetch_real_estate_items",
            side_effect=GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다."),
        ),
    ):
        breakdown = net_worth_service.compute_growlio_unlinked(db, "token")

    assert breakdown["net_total"] == Decimal("0")
    assert breakdown["item_count"] == 0


# --- 화면 로드 시 기회주의적 growlio 동기화 ------------------------------------------------

NOW = datetime(2026, 7, 15, 12, 0, 0)


def _linked_product(db, *, synced_at, growlio_id="growlio-1", owner_user_id=None, auto_sync=True, balance="0"):
    p = savings_product_service.create_product(db, f"연동-{growlio_id}", Decimal(balance), Decimal("0"), "investment")
    p.growlio_account_id = growlio_id
    p.auto_sync_enabled = auto_sync
    p.owner_user_id = owner_user_id
    p.last_synced_at = synced_at
    db.commit()
    return p


def _refresh(db, user_id, **patches):
    """자체 SessionLocal()을 테스트 세션으로 돌려 refresh_stale_growlio_links를 실행한다."""
    with (
        patch("app.database.SessionLocal", return_value=db),
        patch.object(db, "close"),
    ):
        net_worth_service.refresh_stale_growlio_links("token", user_id, now=NOW)


def test_has_stale_growlio_links_true_when_never_synced(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=None)
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is True


def test_has_stale_growlio_links_true_when_older_than_window(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=NOW - timedelta(hours=13))
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is True


def test_has_stale_growlio_links_false_when_recently_synced(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=NOW - timedelta(hours=1))
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is False


def test_has_stale_growlio_links_false_without_auto_sync_flag(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=None, auto_sync=False)
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is False


def test_has_stale_growlio_links_ignores_spouse_owned_items(seeded_db):
    """호출자 JWT로는 배우자 항목이 growlio에서 매칭되지 않아 영원히 stale로 남는다 — 이걸 세면
    배우자가 아닌 쪽이 화면을 열 때마다 growlio를 호출한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    _linked_product(db, synced_at=None, owner_user_id=spouse.id)
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is False
    assert net_worth_service._has_stale_growlio_links(db, NOW, spouse.id) is True


def test_has_stale_growlio_links_counts_loan_only_via_auto_synced_property(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    prop = _linked_product(db, synced_at=NOW, growlio_id="re-1", auto_sync=False)
    prop.product_type = "real_estate"
    loan = loan_service.create_loan(db, "담보대출", Decimal("100"), Decimal("0"), None, None, None, None)
    loan.growlio_account_id = "re-1"
    loan.auto_sync_enabled = True
    db.commit()
    # 짝 부동산이 자동 동기화 대상이 아니면 백그라운드로는 대출을 갱신할 방법이 없다 → stale로 세지 않음
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is False

    prop.auto_sync_enabled = True
    db.commit()
    assert net_worth_service._has_stale_growlio_links(db, NOW, user.id) is True


def test_refresh_stale_growlio_links_runs_filtered_syncs_and_skips_bank_accounts(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=None)
    savings = MagicMock(return_value=(1, []))
    real_estate = MagicMock(return_value=(0, []))
    accounts = MagicMock(return_value=(0, []))
    with (
        patch("app.services.account_service.sync_all_accounts", accounts),
        patch("app.services.net_worth_service.savings_product_growlio_service.sync_all_from_growlio", savings),
        patch("app.services.net_worth_service.real_estate_service.sync_all_from_growlio", real_estate),
    ):
        _refresh(db, user.id)

    accounts.assert_not_called()
    for sync in (savings, real_estate):
        sync.assert_called_once_with(db, "token", now=NOW, auto_sync_only=True, owner_user_id=user.id)


def test_refresh_stale_growlio_links_keeps_manual_balances_and_bank_accounts(seeded_db):
    """자동 동기화를 끈 상품의 직접 입력 잔액과 연동 은행 계좌의 initial_balance는 백그라운드
    갱신이 건드리지 않는다 — auto_sync 켜진 다른 상품이 stale이라 갱신이 돌더라도."""
    db, user = seeded_db["db"], seeded_db["user"]
    auto = _linked_product(db, synced_at=None, growlio_id="g-auto")
    manual = _linked_product(db, synced_at=None, growlio_id="g-manual", auto_sync=False, balance="777")
    account = account_service.create_account(db, "연동통장", "bank", Decimal("1000"))
    account.growlio_account_id = "g-bank"
    db.commit()
    growlio_accounts = [
        {"id": gid, "name": gid, "asset_type": "investment", "current_value_krw": 5000}
        for gid in ("g-auto", "g-manual", "g-bank")
    ]
    with (
        patch("app.services.growlio_client.fetch_account_balances", return_value=growlio_accounts) as fetch,
        patch("app.services.growlio_client.fetch_real_estate_items", return_value=[]),
    ):
        _refresh(db, user.id)

    db.expire_all()
    assert auto.current_balance == Decimal("5000")
    assert manual.current_balance == Decimal("777")
    assert account.initial_balance == Decimal("1000")
    fetch.assert_called_once_with("token")


def test_refresh_stale_growlio_links_noop_when_fresh(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=NOW - timedelta(hours=1))
    sync = MagicMock(return_value=(0, []))
    with patch("app.services.net_worth_service.savings_product_growlio_service.sync_all_from_growlio", sync):
        _refresh(db, user.id)

    sync.assert_not_called()


def test_refresh_stale_growlio_links_stops_quietly_when_growlio_unavailable(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=None)
    later = MagicMock(return_value=(0, []))
    with (
        patch(
            "app.services.net_worth_service.savings_product_growlio_service.sync_all_from_growlio",
            side_effect=GrowlioRequestError("growlio 서버에 연결하지 못했습니다."),
        ),
        patch("app.services.net_worth_service.real_estate_service.sync_all_from_growlio", later),
    ):
        _refresh(db, user.id)  # 예외 밖으로 안 던짐

    later.assert_not_called()


def test_refresh_stale_growlio_links_rolls_back_after_unexpected_section_error(seeded_db):
    """한 섹션이 예상 밖 예외로 실패하면 세션을 롤백한 뒤 다음 섹션을 계속 진행한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _linked_product(db, synced_at=None)
    later = MagicMock(return_value=(0, []))
    with (
        patch.object(db, "rollback") as rollback,
        patch(
            "app.services.net_worth_service.savings_product_growlio_service.sync_all_from_growlio",
            side_effect=RuntimeError("boom"),
        ),
        patch("app.services.net_worth_service.real_estate_service.sync_all_from_growlio", later),
    ):
        _refresh(db, user.id)

    rollback.assert_called_once()
    later.assert_called_once()
