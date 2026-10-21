import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.errors import InvalidInputError
from app.models.category import Category
from app.models.growlio_push_queue import GrowlioPushQueue
from app.models.transaction import Transaction
from app.services import growlio_push_service, savings_product_service, transaction_report_service
from app.utils.dates import month_bounds

# 검색(q)만 주고 기간을 안 주면 "전체 기간" 합계를 낸다 — 하한을 이 앱에 거래가 있을 리 없는
# 먼 과거로 잡아 사실상 무한 하한처럼 쓴다.
_ALL_TIME_START = date(2000, 1, 1)
# 검색 모드(기간 미지정)의 목록엔 미래 날짜 거래도 포함되므로 합계도 상한을 두지 않는다.
_ALL_TIME_END = date(9999, 12, 31)


class InvalidSavingsLinkError(InvalidInputError):
    pass


def _validate_savings_link(db: Session, category_id: int, type_: str, savings_product_id: int | None) -> None:
    if savings_product_id is None:
        return
    if type_ != "expense":
        raise InvalidSavingsLinkError("저축상품은 지출 내역에만 연결할 수 있습니다.")
    category = db.get(Category, category_id)
    if category is None or not category.is_savings:
        raise InvalidSavingsLinkError("저축상품은 저축 전용 카테고리에서만 연결할 수 있습니다.")


def _send_staged_pushes(
    db: Session, tx: Transaction, rows: list[GrowlioPushQueue | None], bearer_token: str | None
) -> None:
    """커밋 뒤에 호출 — 거래와 같은 커밋으로 남긴 growlio 큐 행(`growlio_push_service.stage`)을 바로 보내 본다.

    growlio가 잠들어있거나 응답하지 않아도 가계부 저장 자체는 이미 끝난 뒤이므로 절대 raise하지 않는다 — 보내지
    못한 동작은 큐에 남아 다음 화면 로드 때 재전송되고, 이번 응답에는 tx의 비영속 플래그
    `Transaction.growlio_sync_failed`(모델에 선언된 클래스 속성, DB 컬럼 아님)를 True로 세팅해 라우터가 응답 헤더로
    알린다(TransactionOut 스키마 변경 없이 소비). 토큰이 없으면(예약 작업 등) 큐에만 남긴다.
    """
    for row in rows:
        if row is None:
            continue
        if not growlio_push_service.send_staged(db, row, bearer_token) and bearer_token:
            tx.growlio_sync_failed = True


def create_transaction(
    db: Session,
    *,
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
    # 거래 저장·저축상품 잔액 조정·growlio 큐 행은 한 커밋으로 묶는다 — 따로 커밋하면 뒤쪽이 실패했을 때
    # 거래만 남고 current_balance가 어긋나거나 growlio 반영이 빠진다. 실제 전송은 되돌릴 수 없는 외부 호출이라 커밋 뒤에.
    pushes = []
    if savings_product_id is not None:
        db.flush()  # 큐 행에 transaction_id를 남기려면 id가 필요하다
        savings_product_service.adjust_balance(db, savings_product_id, amount)
        pushes.append(
            growlio_push_service.stage(db, savings_product_id, "DEPOSIT", amount, transaction_date, transaction_id=tx.id)
        )
    db.commit()
    db.refresh(tx)
    _send_staged_pushes(db, tx, pushes, bearer_token)
    return tx


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

    # 라우터는 수정 폼의 모든 필드를 보내므로, 메모만 고쳐도 아래 -old/+new 잔액조정과 growlio
    # 출금+입금 한 쌍이 나간다(growlio 원장에 의미 없는 내역이 쌓이고, 반쪽 실패 시 잔액이 어긋남).
    # 저축 연동에 영향을 주는 값이 그대로면 건너뛴다.
    savings_changed = (tx.savings_product_id, tx.amount, tx.transaction_date) != (
        old_savings_product_id,
        old_amount,
        old_transaction_date,
    )
    # 잔액 조정·growlio 큐 행도 거래 수정과 같은 커밋에 넣는다(create_transaction 주석 참고).
    pushes = []
    if savings_changed:
        if old_savings_product_id is not None:
            savings_product_service.adjust_balance(db, old_savings_product_id, -old_amount)
            pushes.append(
                growlio_push_service.stage(
                    db, old_savings_product_id, "WITHDRAWAL", old_amount, old_transaction_date, transaction_id=tx.id
                )
            )
        if new_savings_product_id is not None:
            savings_product_service.adjust_balance(db, new_savings_product_id, tx.amount)
            pushes.append(
                growlio_push_service.stage(
                    db, new_savings_product_id, "DEPOSIT", tx.amount, tx.transaction_date, transaction_id=tx.id
                )
            )
    db.commit()
    db.refresh(tx)
    _send_staged_pushes(db, tx, pushes, bearer_token)
    return tx


def _stage_delete(db: Session, tx: Transaction) -> GrowlioPushQueue | None:
    """커밋하지 않고 삭제·저축잔액 롤백·growlio 출금 큐 행만 세션에 올린다. 큐 행은 삭제와 같은 커밋으로 남고
    전송은 커밋 뒤에 한다 — 먼저 보내고 삭제가 실패하면 growlio만 빠진다. 큐 행은 거래와 FK로 묶이지 않아
    거래가 지워져도 남는다."""
    row = None
    if tx.savings_product_id is not None:
        savings_product_service.adjust_balance(db, tx.savings_product_id, -tx.amount)
        row = growlio_push_service.stage(
            db, tx.savings_product_id, "WITHDRAWAL", tx.amount, tx.transaction_date, transaction_id=tx.id
        )
    db.delete(tx)
    return row


def delete_transaction(db: Session, tx_id: int, bearer_token: str | None = None) -> bool:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        return False
    pushes = [_stage_delete(db, tx)]
    db.commit()
    _send_staged_pushes(db, tx, pushes, bearer_token)
    return True


def bulk_delete_transactions(
    db: Session, tx_ids: list[int], bearer_token: str | None = None
) -> tuple[int, list[int]]:
    """가져오기 되돌리기 등에서 여러 건을 한 번에 지울 때 쓴다. 단건 삭제와 같은 저축잔액 롤백·growlio 큐 행을
    전부 세션에 올린 뒤 **한 번에 커밋**한다 — 중간에 DB 오류가 나면 아무것도 지워지지 않는다(행마다
    커밋하던 시절엔 앞쪽 일부만 지워진 채 남았다). 존재하지 않는 id만 실패 목록으로 돌려주고 나머지는
    지운다(그 경우의 부분 성공은 의도된 동작). growlio 출금은 커밋 후 best-effort로 보낸다."""
    unique_ids = list(dict.fromkeys(tx_ids))
    found = {tx.id: tx for tx in db.query(Transaction).filter(Transaction.id.in_(unique_ids))} if unique_ids else {}
    deleted = [found[tx_id] for tx_id in unique_ids if tx_id in found]
    try:
        pushes = [(tx, _stage_delete(db, tx)) for tx in deleted]
        db.commit()
    except Exception:
        db.rollback()
        raise
    for tx, row in pushes:
        _send_staged_pushes(db, tx, [row], bearer_token)
    return len(deleted), [tx_id for tx_id in unique_ids if tx_id not in found]


def period_or_this_month(date_from: date | None, date_to: date | None, today: date) -> tuple[date, date]:
    """조회 기간 기본값 — 지정하지 않은 쪽은 이번 달 경계로 채운다."""
    default_from, default_to = month_bounds(today)
    return date_from or default_from, date_to or default_to


def list_with_totals(
    db: Session,
    today: date,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type_: str | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = None,
) -> dict:
    """가계부 목록(TransactionListOut). 기간 미지정이면 이번 달, 단 검색어(q)가 있으면 기간 제한 없이 전체에서
    찾는다 — 그때 합계도 같은 범위(전체 기간)로 낸다."""
    if q:
        df, dt = date_from, date_to
    else:
        df, dt = period_or_this_month(date_from, date_to, today)
    items = list_transactions(db, df, dt, category_id, type_, user_id, q=q)
    totals = transaction_report_service.period_totals(
        db, df or _ALL_TIME_START, dt or _ALL_TIME_END, category_id=category_id, type_=type_, user_id=user_id, q=q
    )
    return {"items": items, "totals": totals}


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
