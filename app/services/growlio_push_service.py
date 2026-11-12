"""저축·투자 거래를 growlio 계좌 입출금으로 반영하는 아웃박스(GrowlioPushQueue).

전에는 거래 저장 직후 growlio에 한 번 보내 보고 실패하면 경고 헤더만 남겨, growlio가 잠들어 있던 순간의 저축은
growlio에 영영 빠졌다. 이제 반영할 동작을 거래와 같은 커밋으로 큐에 남기고(`stage`) 커밋 뒤 바로 보내 보며
(`send_staged`), 실패한 행은 다음 화면 로드 때 호출자 JWT로 다시 보낸다(`flush_pending`). 키 `nestlio:q{id}`로 보내므로 growlio가 같은 행을 한 번만 기록한다 —
"보냈는데 응답만 잃은" 경우에도 재전송이 안전하다.
"""

import logging
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.errors import NotFoundError
from app.models.growlio_push_queue import GrowlioPushQueue
from app.models.savings_product import SavingsProduct
from app.services import growlio_client
from app.utils.dates import now_kst

logger = logging.getLogger(__name__)

EXTERNAL_REF_PREFIX = "nestlio:"
# 한 번의 화면 로드에서 재전송하는 최대 건수 — 오래 밀린 큐가 백그라운드 작업을 붙잡지 않게.
FLUSH_BATCH = 20
# 확정 오류(4xx — 계좌 연동이 끊긴 경우 등)로 이 횟수만큼 실패한 행은 자동으로 보내지 않는다. 자산 화면이
# `list_failed`로 보여 주고 사용자가 `retry`로 다시 보낸다. 일시 오류는 횟수에 넣지 않는다(`_is_transient`).
MAX_ATTEMPTS = 10
_TRANSIENT_STATUSES = {401, 408, 429}

SENT, TRANSIENT, PERMANENT = "sent", "transient", "permanent"


def external_ref(row: GrowlioPushQueue) -> str:
    return f"{EXTERNAL_REF_PREFIX}q{row.id}"


def stage(
    db: Session,
    savings_product_id: int,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    transaction_id: int | None = None,
) -> GrowlioPushQueue | None:
    """반영할 동작을 큐 행으로 세션에 올리기만 한다(커밋 안 함) — growlio 연동 상품이 아니면 None.

    호출자는 이 행을 거래 저장과 **같은 커밋**으로 묶는다. 따로 커밋하면 그 사이에 실패했을 때 거래만 남고
    큐 행이 없어 growlio 반영이 영영 빠진다(아웃박스를 둔 이유가 사라짐). 보내기는 커밋 뒤 `send_staged`로."""
    product = db.get(SavingsProduct, savings_product_id)
    if product is None or not product.growlio_account_id:
        return None
    row = GrowlioPushQueue(
        growlio_account_id=product.growlio_account_id,
        owner_user_id=product.owner_user_id,
        transaction_id=transaction_id,
        transaction_type=transaction_type,
        amount=amount,
        transaction_date=transaction_date,
    )
    db.add(row)
    return row


def _is_transient(exc: Exception) -> bool:
    """다시 보내면 성공할 수 있는 실패인가 — 미설정·접속 실패·타임아웃·5xx·401(토큰 만료)·408·429.
    이런 실패는 행 자체의 문제가 아니라 attempts를 올리지 않는다(growlio가 오래 잠들어도 행을 포기하지 않게)."""
    if isinstance(exc, growlio_client.GrowlioNotConfiguredError):
        return True
    status = getattr(exc, "upstream_status", None)
    return status is None or status >= 500 or status in _TRANSIENT_STATUSES


def _commit_or_rollback(db: Session, row_id: int) -> None:
    """전송 결과 기록 커밋 — 실패해도 raise하지 않는다. 호출자의 거래는 이미 커밋된 뒤라 여기서 터지면 저장에 성공한
    요청이 500으로 응답된다. 기록을 잃은 행은 다음 재전송이 같은 external_ref로 보내 growlio가 한 번만 기록한다."""
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("growlio_push_record_failed queue_id=%s", row_id)


def _send(db: Session, row: GrowlioPushQueue, bearer_token: str, now: datetime | None = None) -> str:
    """한 행을 보내고 결과를 SENT / TRANSIENT / PERMANENT 중 하나로 돌려준다. 절대 raise하지 않는다."""
    now = now or now_kst()
    row_id = row.id
    try:
        growlio_client.push_transaction(
            bearer_token,
            row.growlio_account_id,
            row.transaction_type,
            row.amount,
            row.transaction_date,
            external_ref=external_ref(row),
        )
    except (growlio_client.GrowlioNotConfiguredError, growlio_client.GrowlioRequestError) as exc:
        transient = _is_transient(exc)
        if not transient:
            row.attempts += 1
        row.last_error = str(exc)[:200]
        _commit_or_rollback(db, row_id)
        return TRANSIENT if transient else PERMANENT
    row.sent_at = now
    _commit_or_rollback(db, row_id)
    return SENT


def send(db: Session, row: GrowlioPushQueue, bearer_token: str, now: datetime | None = None) -> bool:
    """한 행을 growlio에 보낸다. 성공(새로 기록됐거나 이미 기록돼 있던 경우 모두)이면 sent_at을 채우고 True.
    실패는 last_error를 남기고 False — 확정 오류(그 밖의 4xx)만 attempts를 올린다. 절대 raise하지 않는다."""
    return _send(db, row, bearer_token, now) == SENT


def send_staged(db: Session, row: GrowlioPushQueue, bearer_token: str | None) -> bool:
    """커밋된 큐 행을 바로 보내 본다. 보냈으면 True, 남겨 두었으면 False(호출자가 경고 헤더를 띄운다).
    토큰이 없으면(예약 작업 등) 보내지 않고 남겨 둔다 — 다음 화면 로드 때 `flush_pending`이 보낸다."""
    if not bearer_token:
        return False
    ok = send(db, row, bearer_token)
    if not ok:
        logger.warning(
            "growlio_push_queued queue_id=%s type=%s amount=%s (거래는 정상 저장됨, 다음 화면 로드 때 재전송)",
            row.id,
            row.transaction_type,
            row.amount,
        )
    return ok


def pending_query(db: Session, user_id: uuid.UUID):
    return (
        db.query(GrowlioPushQueue)
        .filter(
            GrowlioPushQueue.sent_at.is_(None),
            GrowlioPushQueue.attempts < MAX_ATTEMPTS,
            _owned_by(user_id),
        )
        .order_by(GrowlioPushQueue.id)
    )


def flush_pending(bearer_token: str, user_id: uuid.UUID, *, now: datetime | None = None) -> int:
    """남은 행을 오래된 순으로 다시 보낸다(호출자·공동 소유만, 최대 FLUSH_BATCH건). 화면 로드 시 BackgroundTasks로
    불린다 — 자체 세션을 열고 절대 raise하지 않는다. growlio가 아직 응답하지 않으면(일시 오류) 첫 실패에서 멈춘다(매
    행마다 타임아웃을 기다리지 않게). 확정 오류는 그 행만의 문제라 건너뛰고 다음 행을 보낸다. 보낸 건수를 반환한다."""
    from app.database import SessionLocal

    now = now or now_kst()
    db = SessionLocal()
    sent = 0
    try:
        for row in pending_query(db, user_id).limit(FLUSH_BATCH).all():
            result = _send(db, row, bearer_token, now=now)
            if result == TRANSIENT:
                break
            if result == SENT:
                sent += 1
    except Exception:  # fire-and-forget 백그라운드 작업
        db.rollback()
        logger.exception("growlio_push_flush_failed")
    finally:
        db.close()
    return sent



def _owned_by(user_id: uuid.UUID):
    return or_(GrowlioPushQueue.owner_user_id.is_(None), GrowlioPushQueue.owner_user_id == user_id)


def list_failed(db: Session, user_id: uuid.UUID) -> list[dict]:
    """자동 재전송을 포기한 행(확정 오류로 MAX_ATTEMPTS회 실패, 호출자·공동 소유) — 자산 화면 경고용.
    상품 이름은 같은 growlio 계좌에 연동된 저축상품에서 찾는다(상품이 지워졌으면 None)."""
    rows = (
        db.query(GrowlioPushQueue)
        .filter(
            GrowlioPushQueue.sent_at.is_(None),
            GrowlioPushQueue.attempts >= MAX_ATTEMPTS,
            _owned_by(user_id),
        )
        .order_by(GrowlioPushQueue.id)
        .all()
    )
    account_ids = {row.growlio_account_id for row in rows}
    names = (
        dict(
            db.query(SavingsProduct.growlio_account_id, SavingsProduct.name)
            .filter(SavingsProduct.growlio_account_id.in_(account_ids))
            .all()
        )
        if account_ids
        else {}
    )
    return [
        {
            "id": row.id,
            "product_name": names.get(row.growlio_account_id),
            "transaction_type": row.transaction_type,
            "amount": row.amount,
            "transaction_date": row.transaction_date,
            "last_error": row.last_error,
        }
        for row in rows
    ]


def retry(db: Session, row_id: int, user_id: uuid.UUID, bearer_token: str) -> bool:
    """포기한 행을 사용자가 다시 보낸다. 성공하면 True. 일시 오류면 대기 상태로 돌려 자동 재전송에 맡기고, 확정
    오류면 다시 포기 상태로 둬 목록에 새 사유와 함께 남긴다."""
    row = (
        db.query(GrowlioPushQueue)
        .filter(GrowlioPushQueue.id == row_id, GrowlioPushQueue.sent_at.is_(None), _owned_by(user_id))
        .one_or_none()
    )
    if row is None:
        raise NotFoundError("다시 보낼 growlio 반영 내역을 찾을 수 없습니다.")
    row.attempts = 0
    result = _send(db, row, bearer_token)
    if result == PERMANENT:
        row.attempts = MAX_ATTEMPTS
        _commit_or_rollback(db, row.id)
    return result == SENT
