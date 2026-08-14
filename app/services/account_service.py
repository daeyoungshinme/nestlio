import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction
from app.services import growlio_client
from app.services.growlio_client import GrowlioSyncError


def list_accounts(db: Session, active_only: bool = True) -> list[Account]:
    query = db.query(Account)
    if active_only:
        query = query.filter(Account.is_active.is_(True))
    return query.order_by(Account.sort_order, Account.name).all()


def create_account(
    db: Session, name: str, account_type: str, initial_balance: Decimal, owner_user_id: uuid.UUID | None = None
) -> Account:
    account = Account(
        name=name,
        account_type=account_type,
        initial_balance=initial_balance,
        sort_order=999,
        owner_user_id=owner_user_id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def update_account(
    db: Session,
    account_id: int,
    name: str,
    account_type: str,
    current_balance_value: Decimal,
    owner_user_id: uuid.UUID | None = None,
) -> Account | None:
    account = db.get(Account, account_id)
    if account is None:
        return None
    # 잔액은 initial_balance + 거래 순증감액으로 파생되므로, 입력받은 "현재 잔액"이 그대로
    # 화면에 표시되도록 이미 반영된 거래 순증감액만큼 initial_balance를 역산해 저장한다.
    net_transactions = current_balance(db, account) - account.initial_balance
    account.name = name
    account.account_type = account_type
    account.initial_balance = current_balance_value - net_transactions
    account.owner_user_id = owner_user_id
    db.commit()
    db.refresh(account)
    return account


def deactivate_account(db: Session, account_id: int) -> None:
    account = db.get(Account, account_id)
    if account is not None:
        account.is_active = False
        account.growlio_account_id = None
        db.commit()


def list_growlio_bank_accounts(bearer_token: str) -> list[dict]:
    """계좌 가져오기 UI를 위해 growlio 계좌 중 은행 계좌(BANK_ACCOUNT)만 전달한다.

    투자성 계좌는 저축상품 가져오기(savings_product_service)의 몫이라 여기서는 제외한다.
    """
    accounts = growlio_client.fetch_account_balances(bearer_token)
    return [a for a in accounts if a["asset_type"] in growlio_client.BANK_ASSET_TYPES]


def import_from_growlio(
    db: Session, growlio_account_ids: list[str], bearer_token: str, owner_user_id: uuid.UUID
) -> list[Account]:
    """선택한 growlio 은행 계좌들을 각각 새 계좌로 1회성 잔액 시딩하며 가져온다.

    이후 잔액은 growlio가 아니라 가계부 거래 내역으로 파생되므로(current_balance) 지속 동기화는 하지 않는다.
    owner_user_id는 가져오기를 실행한 사용자(bearer_token의 주인)로, growlio 자체가 그 사람의
    Supabase JWT 기준으로 스코프된 계좌만 돌려주므로 이 사람이 곧 실제 소유자다.
    """
    if not growlio_account_ids:
        return []
    accounts_by_id = {
        a["id"]: a
        for a in growlio_client.fetch_account_balances(bearer_token)
        if a["asset_type"] in growlio_client.BANK_ASSET_TYPES
    }
    already_linked = growlio_client.already_linked_growlio_ids(db, Account)
    created: list[Account] = []
    for account_id in growlio_account_ids:
        if account_id in already_linked:
            continue
        account = accounts_by_id.get(account_id)
        if account is None:
            continue
        new_account = Account(
            name=account["name"],
            account_type="bank",
            initial_balance=growlio_client.to_decimal_krw(account["current_value_krw"]),
            growlio_account_id=account_id,
            sort_order=999,
            owner_user_id=owner_user_id,
        )
        db.add(new_account)
        created.append(new_account)
    db.commit()
    for account in created:
        db.refresh(account)
    return created


def sync_account(db: Session, account_id: int, bearer_token: str, *, now: datetime) -> Account | None:
    """연동된 growlio 계좌의 최신 잔액에 맞춰 initial_balance를 역산해 재조정한다.

    계좌 잔액은 거래 내역으로 파생되므로(current_balance) growlio 값을 그대로 덮어쓰지 않고,
    update_account의 "현재 잔액 직접 입력" 역산 로직과 동일하게 이미 반영된 거래 순증감액만큼
    initial_balance를 계산해 화면상 잔액이 growlio 값과 정확히 일치하도록 만든다.
    """
    account = db.get(Account, account_id)
    if account is None:
        return None
    if not account.growlio_account_id:
        raise GrowlioSyncError("연동된 growlio 계좌가 없습니다.")
    accounts = growlio_client.fetch_account_balances(bearer_token)
    match = growlio_client.find_by_growlio_id(accounts, account.growlio_account_id)
    if match is None:
        raise GrowlioSyncError("growlio에서 연동된 계좌를 찾을 수 없습니다. 계좌가 삭제되었을 수 있습니다.")
    net_transactions = current_balance(db, account) - account.initial_balance
    account.initial_balance = growlio_client.to_decimal_krw(match["current_value_krw"]) - net_transactions
    account.last_synced_at = now
    db.commit()
    db.refresh(account)
    return account


def sync_all_accounts(db: Session, bearer_token: str, *, now: datetime) -> tuple[int, list[dict]]:
    """연동된 계좌를 모두 한 번에 동기화한다 (자산현황 "전체 동기화").

    growlio 목록은 1회만 조회해 여러 계좌에 매칭한다 - 건별 sync_account처럼 계좌마다
    growlio를 재호출하지 않는다. 배우자 소유 등으로 매칭이 안 되는 계좌는 예외를 던지지
    않고 failed 목록에 담아 나머지 계좌 동기화를 계속 진행한다.
    """
    linked_accounts = [a for a in list_accounts(db) if a.growlio_account_id]
    if not linked_accounts:
        return 0, []
    growlio_accounts = growlio_client.fetch_account_balances(bearer_token)
    synced_count = 0
    failed: list[dict] = []
    for account in linked_accounts:
        match = growlio_client.find_by_growlio_id(growlio_accounts, account.growlio_account_id)
        if match is None:
            failed.append(
                {
                    "id": account.id,
                    "name": account.name,
                    "reason": "growlio에서 연동된 계좌를 찾을 수 없습니다 (배우자 계정이거나 삭제되었을 수 있습니다).",
                }
            )
            continue
        net_transactions = current_balance(db, account) - account.initial_balance
        account.initial_balance = growlio_client.to_decimal_krw(match["current_value_krw"]) - net_transactions
        account.last_synced_at = now
        synced_count += 1
    db.commit()
    return synced_count, failed


def current_balance(db: Session, account: Account) -> Decimal:
    rows = (
        db.query(Transaction.type, func.sum(Transaction.amount))
        .filter(Transaction.account_id == account.id)
        .group_by(Transaction.type)
        .all()
    )
    totals = {tx_type: amount or Decimal("0") for tx_type, amount in rows}
    income = totals.get("income", Decimal("0"))
    expense = totals.get("expense", Decimal("0"))
    return Decimal(account.initial_balance) + Decimal(income) - Decimal(expense)


def list_with_balances(db: Session) -> list[dict]:
    accounts = list_accounts(db)
    account_ids = [account.id for account in accounts]
    rows = (
        db.query(Transaction.account_id, Transaction.type, func.sum(Transaction.amount))
        .filter(Transaction.account_id.in_(account_ids))
        .group_by(Transaction.account_id, Transaction.type)
        .all()
    )
    totals: dict[int, dict[str, Decimal]] = {}
    for account_id, tx_type, amount in rows:
        totals.setdefault(account_id, {})[tx_type] = amount or Decimal("0")

    return [
        {
            "account": account,
            "balance": (
                Decimal(account.initial_balance)
                + totals.get(account.id, {}).get("income", Decimal("0"))
                - totals.get(account.id, {}).get("expense", Decimal("0"))
            ),
        }
        for account in accounts
    ]
