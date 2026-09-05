import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.savings_product import SavingsProduct
from app.models.transaction import Transaction
from app.services import growlio_client, savings_product_service

logger = logging.getLogger(__name__)


def _validate_savings_link(db: Session, category_id: int, type_: str, savings_product_id: int | None) -> None:
    if savings_product_id is None:
        return
    if type_ != "expense":
        raise ValueError("저축상품은 지출 내역에만 연결할 수 있습니다.")
    category = db.get(Category, category_id)
    if category is None or not category.is_savings:
        raise ValueError("저축상품은 저축 전용 카테고리에서만 연결할 수 있습니다.")


def _push_growlio(
    db: Session,
    tx: Transaction,
    savings_product_id: int,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    bearer_token: str | None,
) -> None:
    """저축/투자 잔액 조정을 growlio 쪽에도 best-effort로 반영한다.

    growlio가 잠들어있거나 응답하지 않아도 가계부 저장 자체는 이미 끝난 뒤이므로 절대
    raise하지 않는다 — 실패 시 로그만 남기고 tx의 비영속 플래그
    `Transaction.growlio_sync_failed`(모델에 선언된 클래스 속성, DB 컬럼 아님)를 True로 세팅해
    라우터가 응답 헤더로 경고를 알릴 수 있게 한다(TransactionOut 스키마 변경 없이 소비).
    """
    if not bearer_token:
        return
    product = db.get(SavingsProduct, savings_product_id)
    if product is None or not product.growlio_account_id:
        return
    try:
        growlio_client.push_transaction(
            bearer_token, product.growlio_account_id, transaction_type, amount, transaction_date
        )
    except (growlio_client.GrowlioNotConfiguredError, growlio_client.GrowlioRequestError):
        logger.warning(
            "growlio_push_failed savings_product_id=%s type=%s amount=%s (거래는 정상 저장됨)",
            savings_product_id,
            transaction_type,
            amount,
            exc_info=True,
        )
        tx.growlio_sync_failed = True


def create_transaction(
    db: Session,
    user_id: uuid.UUID,
    category_id: int,
    type_: str,
    amount: Decimal,
    transaction_date: date,
    description: str | None = None,
    payment_method: str | None = None,
    recurring_expense_id: int | None = None,
    account_id: int | None = None,
    savings_product_id: int | None = None,
    owner_user_id: uuid.UUID | None = None,
    bearer_token: str | None = None,
) -> Transaction:
    _validate_savings_link(db, category_id, type_, savings_product_id)
    tx = Transaction(
        user_id=user_id,
        category_id=category_id,
        type=type_,
        amount=amount,
        transaction_date=transaction_date,
        description=description,
        payment_method=payment_method,
        recurring_expense_id=recurring_expense_id,
        account_id=account_id,
        savings_product_id=savings_product_id,
        owner_user_id=owner_user_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    if savings_product_id is not None:
        savings_product_service.adjust_balance(db, savings_product_id, amount)
        db.refresh(tx)
        _push_growlio(db, tx, savings_product_id, "DEPOSIT", amount, transaction_date, bearer_token)
    return tx


def get_transaction(db: Session, tx_id: int) -> Transaction | None:
    return db.get(Transaction, tx_id)


def update_transaction(db: Session, tx_id: int, bearer_token: str | None = None, **fields) -> Transaction | None:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return None
    new_type = fields.get("type", tx.type)
    new_category_id = fields.get("category_id", tx.category_id)
    new_savings_product_id = fields.get("savings_product_id", tx.savings_product_id)
    _validate_savings_link(db, new_category_id, new_type, new_savings_product_id)

    old_amount = tx.amount
    old_savings_product_id = tx.savings_product_id
    old_transaction_date = tx.transaction_date
    for key, value in fields.items():
        setattr(tx, key, value)
    db.commit()
    db.refresh(tx)

    if old_savings_product_id is not None:
        savings_product_service.adjust_balance(db, old_savings_product_id, -old_amount)
    if new_savings_product_id is not None:
        savings_product_service.adjust_balance(db, new_savings_product_id, tx.amount)
    if old_savings_product_id is not None or new_savings_product_id is not None:
        db.refresh(tx)

    if old_savings_product_id is not None:
        _push_growlio(db, tx, old_savings_product_id, "WITHDRAWAL", old_amount, old_transaction_date, bearer_token)
    if new_savings_product_id is not None:
        _push_growlio(db, tx, new_savings_product_id, "DEPOSIT", tx.amount, tx.transaction_date, bearer_token)
    return tx


def delete_transaction(db: Session, tx_id: int, bearer_token: str | None = None) -> bool:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return False
    if tx.savings_product_id is not None:
        savings_product_service.adjust_balance(db, tx.savings_product_id, -tx.amount)
        _push_growlio(db, tx, tx.savings_product_id, "WITHDRAWAL", tx.amount, tx.transaction_date, bearer_token)
    db.delete(tx)
    db.commit()
    return True


def bulk_delete_transactions(
    db: Session, tx_ids: list[int], bearer_token: str | None = None
) -> tuple[int, list[int]]:
    """가져오기 되돌리기 등에서 여러 건을 한 번에 지울 때 쓴다. 한 건씩 delete_transaction을
    재사용해 저축잔액 롤백/growlio push를 단건 삭제와 동일하게 유지하고, 존재하지 않는 id는
    실패 목록에 담아 나머지를 계속 처리한다(부분 실패로 전체를 막지 않음)."""
    deleted = 0
    failed: list[int] = []
    for tx_id in tx_ids:
        if delete_transaction(db, tx_id, bearer_token=bearer_token):
            deleted += 1
        else:
            failed.append(tx_id)
    return deleted, failed


def list_transactions(
    db: Session,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type_: str | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = None,
) -> list[Transaction]:
    query = db.query(Transaction)
    if date_from is not None:
        query = query.filter(Transaction.transaction_date >= date_from)
    if date_to is not None:
        query = query.filter(Transaction.transaction_date <= date_to)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type_ is not None:
        query = query.filter(Transaction.type == type_)
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.join(Category, Transaction.category_id == Category.id).filter(
            or_(Transaction.description.ilike(like), Category.name.ilike(like))
        )
    return query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()


def frequent_unique_transactions(
    db: Session,
    type_: str,
    today: date,
    is_savings: bool = False,
    limit: int = 8,
    since_days: int = 90,
    scan_limit: int = 300,
) -> list[Transaction]:
    """Transactions grouped by (category, description, amount, account, savings product) within
    the last `since_days` days, ranked by how many times that exact combo was registered (ties
    broken by most recent). Used to let the user one-tap re-register a frequently repeated entry."""
    cutoff = today - timedelta(days=since_days)
    rows = (
        db.query(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == type_,
            Category.is_savings.is_(is_savings),
            Transaction.transaction_date >= cutoff,
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .limit(scan_limit)
        .all()
    )
    groups: dict[tuple, dict] = {}
    for tx in rows:
        key = (tx.category_id, tx.description, tx.amount, tx.account_id, tx.savings_product_id)
        group = groups.setdefault(key, {"count": 0, "tx": tx})
        group["count"] += 1
    ranked = sorted(
        groups.values(),
        key=lambda g: (-g["count"], -g["tx"].transaction_date.toordinal(), -g["tx"].id),
    )
    return [g["tx"] for g in ranked[:limit]]
