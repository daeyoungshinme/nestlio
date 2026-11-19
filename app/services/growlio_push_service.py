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
# `list_failed`로 보여 주고 사용자가 `retry`로 다시 보낸다.
MAX_ATTEMPTS = 10
# growlio 5xx는 행 자체의 문제일 수도(같은 행만 계속 500), 잠깐의 장애일 수도 있어 따로 세고 더 넉넉한 상한에서 포기한다.
# 세지 않으면 그런 행이 큐에 영원히 남아 실패 배너에도 뜨지 않는다.
MAX_SERVER_ERRORS = 30
# 접속 실패·토큰 만료(401)·408·429·미설정 — growlio 전체가 지금 받지 못하는 상태라 행 탓이 아니다. 세지 않고 재전송을 멈춘다.
_OFFLINE_STATUSES = {401, 408, 429}
# 공동 상품 행에서 이 상태는 "이 토큰의 주인은 그 growlio 계좌를 모른다" — 계좌 주인인 배우자는 보낼 수 있다.
_DENIED_STATUSES = {403, 404}

# 전송 결과: SENT 성공 / OFFLINE growlio가 지금 못 받음(재전송 멈춤) / SERVER_ERROR 5xx(그 행만 건너뜀) /
# DENIED 공동 행을 이 사용자가 보낼 수 없음(그 사용자 재전송에서 뺌) / PERMANENT 확정 오류(attempts +1).
SENT, OFFLINE, SERVER_ERROR, DENIED, PERMANENT = "sent", "offline", "server_error", "denied", "permanent"


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
    deposit = _last_deposit_row(db, transaction_id) if transaction_type == "WITHDRAWAL" else None
    if deposit is not None:
        # 입금을 보낸 그 계좌에서 뺀다 — 그 사이 상품을 다른 growlio 계좌로 다시 연결했거나 연동을 끊었어도.
        growlio_account_id, owner_user_id = deposit.growlio_account_id, deposit.owner_user_id
    else:
        # 큐 기록이 없는 입금(아웃박스 이전에 직접 보낸 입금 포함)은 지금 연동된 계좌 기준.
        product = db.get(SavingsProduct, savings_product_id)
        if product is None or not product.growlio_account_id:
            return None
        growlio_account_id, owner_user_id = product.growlio_account_id, product.owner_user_id
    row = GrowlioPushQueue(
        growlio_account_id=growlio_account_id,
        owner_user_id=owner_user_id,
        transaction_id=transaction_id,
        transaction_type=transaction_type,
        amount=amount,
        transaction_date=transaction_date,
    )
    db.add(row)
    return row


def _last_deposit_row(db: Session, transaction_id: int | None) -> GrowlioPushQueue | None:
    """그 거래의 가장 최근 입금 큐 행 — 그 뒤에 출금 행이 이미 있으면(이미 되돌린 입금) None."""
    if transaction_id is None:
        return None
    last = (
        db.query(GrowlioPushQueue)
        .filter(GrowlioPushQueue.transaction_id == transaction_id)
        .order_by(GrowlioPushQueue.id.desc())
        .first()
    )
    return last if last is not None and last.transaction_type == "DEPOSIT" else None


def _classify(exc: Exception) -> str:
    """실패를 OFFLINE / SERVER_ERROR / PERMANENT로 나눈다(DENIED는 행·호출자를 알아야 해 `_send`가 가른다)."""
    if isinstance(exc, growlio_client.GrowlioNotConfiguredError):
        return OFFLINE
    status = getattr(exc, "upstream_status", None)
    if status is None or status in _OFFLINE_STATUSES:
        return OFFLINE
    if status >= 500:
        return SERVER_ERROR
    return PERMANENT


def _commit_or_rollback(db: Session, row_id: int) -> None:
    """전송 결과 기록 커밋 — 실패해도 raise하지 않는다. 호출자의 거래는 이미 커밋된 뒤라 여기서 터지면 저장에 성공한
    요청이 500으로 응답된다. 기록을 잃은 행은 다음 재전송이 같은 external_ref로 보내 growlio가 한 번만 기록한다."""
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("growlio_push_record_failed queue_id=%s", row_id)


def _send(
    db: Session,
    row: GrowlioPushQueue,
    bearer_token: str,
    *,
    user_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> str:
    """한 행을 보내고 결과(SENT / OFFLINE / SERVER_ERROR / DENIED / PERMANENT)를 돌려준다. 절대 raise하지 않는다.
    `user_id`는 토큰 주인 — 공동 행의 403/404를 그 사람만의 거부(DENIED)로 볼지 가르는 데 쓴다."""
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
        result = _classify(exc)
        if result == SERVER_ERROR:
            row.server_errors += 1
        elif result == PERMANENT:
            first_denial = (
                row.owner_user_id is None
                and row.denied_user_id is None
                and user_id is not None
                and getattr(exc, "upstream_status", None) in _DENIED_STATUSES
            )
            if first_denial:
                row.denied_user_id = user_id
                result = DENIED
            else:
                row.attempts += 1
        row.last_error = str(exc)[:200]
        _commit_or_rollback(db, row_id)
        return result
    row.sent_at = now
    _commit_or_rollback(db, row_id)
    return SENT


def send(
    db: Session,
    row: GrowlioPushQueue,
    bearer_token: str,
    now: datetime | None = None,
    user_id: uuid.UUID | None = None,
) -> bool:
    """한 행을 growlio에 보낸다. 성공(새로 기록됐거나 이미 기록돼 있던 경우 모두)이면 sent_at을 채우고 True.
    실패는 last_error를 남기고 False(카운터 규칙은 `_send`). 절대 raise하지 않는다."""
    return _send(db, row, bearer_token, user_id=user_id, now=now) == SENT


def _claim(db: Session, row_id: int, query=None) -> GrowlioPushQueue | None:
    """아직 안 보낸 그 행을 행 잠금으로 가져온다 — 다른 요청·백그라운드 재전송이 잡고 있으면 None. 잠금은 `_send`의
    커밋까지라 같은 행을 두 곳에서 동시에 보내지 않는다(external_ref를 모르는 구버전 growlio는 두 번 기록한다).
    SQLite(테스트)는 FOR UPDATE를 무시한다."""
    if query is None:
        query = db.query(GrowlioPushQueue).filter(GrowlioPushQueue.sent_at.is_(None))
    return query.filter(GrowlioPushQueue.id == row_id).with_for_update(skip_locked=True).one_or_none()


def send_staged(
    db: Session, row: GrowlioPushQueue, bearer_token: str | None, *, caller_id: uuid.UUID | None = None
) -> bool:
    """커밋된 큐 행을 바로 보내 본다. 경고가 필요 없으면 True(보냈거나, 보낼 사람이 따로 있음), 호출자가 경고 헤더를
    띄워야 하면 False. 토큰이 없으면(예약 작업 등) 보내지 않고 남겨 둔다 — 다음 화면 로드 때 `flush_pending`이 보낸다.
    배우자 소유 상품의 행은 호출자 토큰으로 보내지 않는다(그 growlio 계좌를 모르는 토큰이라 확정 오류만 쌓인다) —
    배우자의 다음 화면 로드 때 보낸다."""
    if not bearer_token:
        return False
    if row.owner_user_id is not None and caller_id is not None and row.owner_user_id != caller_id:
        return True
    if _claim(db, row.id) is None:
        return True  # 이미 보냈거나 다른 재전송이 지금 보내는 중
    ok = send(db, row, bearer_token, user_id=caller_id)
    if not ok:
        logger.warning(
            "growlio_push_queued queue_id=%s type=%s amount=%s (거래는 정상 저장됨, 다음 화면 로드 때 재전송)",
            row.id,
            row.transaction_type,
            row.amount,
        )
    return ok


def _not_abandoned():
    return (GrowlioPushQueue.attempts < MAX_ATTEMPTS) & (GrowlioPushQueue.server_errors < MAX_SERVER_ERRORS)


def _abandoned():
    return or_(GrowlioPushQueue.attempts >= MAX_ATTEMPTS, GrowlioPushQueue.server_errors >= MAX_SERVER_ERRORS)


def pending_query(db: Session, user_id: uuid.UUID):
    """`user_id`의 토큰으로 자동 재전송할 행 — 안 보냈고, 포기하지 않았고, 호출자·공동 소유이고, 이 사용자가 거부한
    공동 행이 아닌 것."""
    return (
        db.query(GrowlioPushQueue)
        .filter(
            GrowlioPushQueue.sent_at.is_(None),
            _not_abandoned(),
            _owned_by(user_id),
            or_(GrowlioPushQueue.denied_user_id.is_(None), GrowlioPushQueue.denied_user_id != user_id),
        )
        .order_by(GrowlioPushQueue.id)
    )


def flush_pending(bearer_token: str, user_id: uuid.UUID, *, now: datetime | None = None) -> int:
    """남은 행을 오래된 순으로 다시 보낸다(최대 FLUSH_BATCH건). 화면 로드 시 BackgroundTasks로 불린다 — 자체 세션을
    열고 절대 raise하지 않는다. growlio가 지금 받지 못하면(OFFLINE) 첫 실패에서 멈춘다(매 행마다 타임아웃을 기다리지
    않게). 5xx·확정 오류·거부는 그 행만의 문제일 수 있어 건너뛰고 다음 행을 보낸다 — 행 하나가 큐 전체를 막지 않게.
    행은 하나씩 잠가 가져온다(`_claim`과 같은 이유) — 다른 요청이 보내는 중인 행은 건너뛴다. 보낸 건수를 반환한다."""
    from app.database import SessionLocal

    now = now or now_kst()
    db = SessionLocal()
    sent = 0
    last_id = 0
    try:
        for _ in range(FLUSH_BATCH):
            row = (
                pending_query(db, user_id)
                .filter(GrowlioPushQueue.id > last_id)
                .with_for_update(skip_locked=True)
                .first()
            )
            if row is None:
                break
            last_id = row.id
            result = _send(db, row, bearer_token, user_id=user_id, now=now)
            if result == OFFLINE:
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
    """자동 재전송을 포기한 행(확정 오류 MAX_ATTEMPTS회 또는 5xx MAX_SERVER_ERRORS회, 호출자·공동 소유) — 자산 화면 경고용.
    상품 이름은 같은 growlio 계좌에 연동된 저축상품에서 찾는다(상품이 지워졌으면 None)."""
    rows = (
        db.query(GrowlioPushQueue)
        .filter(
            GrowlioPushQueue.sent_at.is_(None),
            _abandoned(),
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
    """포기한 행을 사용자가 다시 보낸다. 성공하면 True. 일시 오류(OFFLINE·5xx)면 카운터를 비워 자동 재전송에 맡기고,
    확정 오류·거부면 포기 상태 그대로 새 사유와 함께 목록에 남긴다. 카운터는 결과가 나온 뒤에만 바꾼다 — 먼저 비우면
    결과 기록 커밋이 실패했을 때 포기 상태가 풀린 채 남는다."""
    query = db.query(GrowlioPushQueue).filter(GrowlioPushQueue.sent_at.is_(None), _owned_by(user_id))
    if query.filter(GrowlioPushQueue.id == row_id).one_or_none() is None:
        raise NotFoundError("다시 보낼 growlio 반영 내역을 찾을 수 없습니다.")
    row = _claim(db, row_id, query)
    if row is None:
        return False  # 다른 요청이 지금 보내는 중 — 목록 새로고침에 맡긴다
    result = _send(db, row, bearer_token, user_id=user_id)
    if result in (OFFLINE, SERVER_ERROR):
        row.attempts = 0
        row.server_errors = 0
        _commit_or_rollback(db, row.id)
    elif result in (PERMANENT, DENIED):
        row.attempts = max(row.attempts, MAX_ATTEMPTS)
        _commit_or_rollback(db, row.id)
    return result == SENT
