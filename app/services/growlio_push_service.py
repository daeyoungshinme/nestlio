"""저축·투자 거래를 growlio 계좌 입출금으로 반영하는 아웃박스(GrowlioPushQueue).

전에는 거래 저장 직후 growlio에 한 번 보내 보고 실패하면 경고 헤더만 남겨, growlio가 잠들어 있던 순간의 저축은
growlio에 영영 빠졌다. 이제 반영할 동작을 큐에 먼저 남기고 바로 보내 보며(`push_now`), 실패한 행은 다음 화면 로드 때
호출자 JWT로 다시 보낸다(`flush_pending`). 키 `nestlio:q{id}`로 보내므로 growlio가 같은 행을 한 번만 기록한다 —
"보냈는데 응답만 잃은" 경우에도 재전송이 안전하다.
"""

import logging
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.growlio_push_queue import GrowlioPushQueue
from app.models.savings_product import SavingsProduct
from app.services import growlio_client
from app.utils.dates import now_kst

logger = logging.getLogger(__name__)

EXTERNAL_REF_PREFIX = "nestlio:"
# 한 번의 화면 로드에서 재전송하는 최대 건수 — 오래 밀린 큐가 백그라운드 작업을 붙잡지 않게.
FLUSH_BATCH = 20
# 이 횟수만큼 실패한 행은 더 보내지 않는다(계좌 연동이 끊긴 경우 등) — last_error로 원인을 남긴다.
MAX_ATTEMPTS = 10


def external_ref(row: GrowlioPushQueue) -> str:
    return f"{EXTERNAL_REF_PREFIX}q{row.id}"


def enqueue(
    db: Session,
    product: SavingsProduct,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    transaction_id: int | None,
) -> GrowlioPushQueue:
    row = GrowlioPushQueue(
        growlio_account_id=product.growlio_account_id,
        owner_user_id=product.owner_user_id,
        transaction_id=transaction_id,
        transaction_type=transaction_type,
        amount=amount,
        transaction_date=transaction_date,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def send(db: Session, row: GrowlioPushQueue, bearer_token: str, now: datetime | None = None) -> bool:
    """한 행을 growlio에 보낸다. 성공(새로 기록됐거나 이미 기록돼 있던 경우 모두)이면 sent_at을 채우고 True.
    growlio 미설정·접속 실패는 attempts/last_error만 남기고 False — 절대 raise하지 않는다."""
    now = now or now_kst()
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
        row.attempts += 1
        row.last_error = str(exc)[:200]
        db.commit()
        return False
    row.sent_at = now
    db.commit()
    return True


def push_now(
    db: Session,
    savings_product_id: int,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    bearer_token: str | None,
    transaction_id: int | None = None,
) -> bool | None:
    """거래 저장 직후 호출 — growlio 연동 상품이 아니면 None(할 일 없음). 큐에 남기고 토큰이 있으면 바로 보낸다.
    반환: 보냈으면 True, 남겨 두었으면 False(호출자가 경고 헤더를 띄운다). 토큰이 없으면(예약 작업 등) 큐에만 남긴다."""
    product = db.get(SavingsProduct, savings_product_id)
    if product is None or not product.growlio_account_id:
        return None
    row = enqueue(db, product, transaction_type, amount, transaction_date, transaction_id)
    if not bearer_token:
        return False
    ok = send(db, row, bearer_token)
    if not ok:
        logger.warning(
            "growlio_push_queued savings_product_id=%s type=%s amount=%s (거래는 정상 저장됨, 다음 화면 로드 때 재전송)",
            savings_product_id,
            transaction_type,
            amount,
        )
    return ok


def pending_query(db: Session, user_id: uuid.UUID):
    return (
        db.query(GrowlioPushQueue)
        .filter(
            GrowlioPushQueue.sent_at.is_(None),
            GrowlioPushQueue.attempts < MAX_ATTEMPTS,
            or_(GrowlioPushQueue.owner_user_id.is_(None), GrowlioPushQueue.owner_user_id == user_id),
        )
        .order_by(GrowlioPushQueue.id)
    )


def flush_pending(bearer_token: str, user_id: uuid.UUID, *, now: datetime | None = None) -> int:
    """남은 행을 오래된 순으로 다시 보낸다(호출자·공동 소유만, 최대 FLUSH_BATCH건). 화면 로드 시 BackgroundTasks로
    불린다 — 자체 세션을 열고 절대 raise하지 않는다. growlio가 아직 응답하지 않으면 첫 실패에서 멈춘다(매 행마다
    타임아웃을 기다리지 않게). 보낸 건수를 반환한다."""
    from app.database import SessionLocal

    now = now or now_kst()
    db = SessionLocal()
    sent = 0
    try:
        for row in pending_query(db, user_id).limit(FLUSH_BATCH).all():
            if not send(db, row, bearer_token, now=now):
                break
            sent += 1
    except Exception:  # fire-and-forget 백그라운드 작업
        db.rollback()
        logger.exception("growlio_push_flush_failed")
    finally:
        db.close()
    return sent


def pending_count(db: Session, user_id: uuid.UUID) -> int:
    return pending_query(db, user_id).count()
