import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog
from app.models.notification_reaction import NotificationReaction
from app.models.notification_read import NotificationRead
from app.models.transaction import Transaction
from app.models.user import User
from app.services import notification_settings_service
from app.utils.dates import now_kst


class NotificationError(Exception):
    pass


class NotificationNotFoundError(NotificationError):
    pass


class InvalidReactionError(NotificationError):
    pass


# 목표 마일스톤 축하 알림에 배우자가 남길 수 있는 짧은 응원 반응 — 자유 입력이 아니라 정해진
# 이모지 중에서만 고르게 해 스팸/오남용 여지를 없앤다.
REACTION_EMOJIS = ("🎉", "👏", "❤️", "💪", "🥳")


def _read_log_ids(db: Session, user_id: uuid.UUID, log_ids: list[int]) -> set[int]:
    """log_ids 중 user_id가 읽은 것 — 페이지에 나온 알림만 본다(쌓인 읽음 기록 전체를 싣지 않는다)."""
    if not log_ids:
        return set()
    rows = (
        db.query(NotificationRead.notification_log_id)
        .filter(NotificationRead.user_id == user_id, NotificationRead.notification_log_id.in_(log_ids))
        .all()
    )
    return {row[0] for row in rows}


def _reactions_by_log(db: Session, log_ids: list[int]) -> dict[int, list[dict]]:
    if not log_ids:
        return {}
    rows = (
        db.query(NotificationReaction, User.display_name)
        .join(User, NotificationReaction.user_id == User.id)
        .filter(NotificationReaction.notification_log_id.in_(log_ids))
        .order_by(NotificationReaction.created_at.asc())
        .all()
    )
    result: dict[int, list[dict]] = {}
    for reaction, display_name in rows:
        result.setdefault(reaction.notification_log_id, []).append(
            {
                "user_id": reaction.user_id,
                "display_name": display_name,
                "emoji": reaction.emoji,
                "message": reaction.message,
                "created_at": reaction.created_at,
            }
        )
    return result


def list_notifications(db: Session, user_id: uuid.UUID, limit: int = 50) -> list[dict]:
    logs = db.query(NotificationLog).order_by(NotificationLog.sent_at.desc()).limit(limit).all()
    log_ids = [log.id for log in logs]
    read_ids = _read_log_ids(db, user_id, log_ids)
    reactions = _reactions_by_log(db, log_ids)
    return [
        {
            "id": log.id,
            "notif_type": log.notif_type,
            "related_type": log.related_type,
            "related_id": log.related_id,
            "year_month": log.year_month,
            "sent_at": log.sent_at,
            "detail": log.detail,
            "is_read": log.id in read_ids,
            "reactions": reactions.get(log.id, []),
        }
        for log in logs
    ]


def add_reaction(
    db: Session, user_id: uuid.UUID, notification_log_id: int, emoji: str, message: str | None = None
) -> None:
    """배우자가 알림(주로 목표 마일스톤 축하)에 짧은 응원을 남긴다. 이미 반응을 남긴 적이 있으면
    새 이모지/메시지로 덮어쓴다 — 알림 하나당 유저 하나의 반응만 존재한다."""
    if db.get(NotificationLog, notification_log_id) is None:
        raise NotificationNotFoundError("알림을 찾을 수 없습니다.")
    if emoji not in REACTION_EMOJIS:
        raise InvalidReactionError("지원하지 않는 반응이에요.")
    message = message.strip()[:200] or None if message else None
    existing = (
        db.query(NotificationReaction)
        .filter(
            NotificationReaction.notification_log_id == notification_log_id,
            NotificationReaction.user_id == user_id,
        )
        .first()
    )
    if existing is not None:
        existing.emoji = emoji
        existing.message = message
    else:
        db.add(
            NotificationReaction(
                notification_log_id=notification_log_id, user_id=user_id, emoji=emoji, message=message
            )
        )
    db.commit()


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    total = db.query(NotificationLog).count()
    return total - db.query(NotificationRead).filter(NotificationRead.user_id == user_id).count()


def mark_read(db: Session, user_id: uuid.UUID, notification_log_id: int, now: datetime | None = None) -> None:
    now = now or now_kst()
    log = db.get(NotificationLog, notification_log_id)
    if log is None:
        raise NotificationNotFoundError("알림을 찾을 수 없습니다.")
    existing = (
        db.query(NotificationRead)
        .filter(NotificationRead.notification_log_id == notification_log_id, NotificationRead.user_id == user_id)
        .first()
    )
    if existing is not None:
        return
    db.add(NotificationRead(notification_log_id=notification_log_id, user_id=user_id, read_at=now))
    db.commit()


def mark_all_read(db: Session, user_id: uuid.UUID, now: datetime | None = None) -> int:
    now = now or now_kst()
    already_read = db.query(NotificationRead.notification_log_id).filter(NotificationRead.user_id == user_id)
    unread_ids = [row[0] for row in db.query(NotificationLog.id).filter(~NotificationLog.id.in_(already_read))]
    for log_id in unread_ids:
        db.add(NotificationRead(notification_log_id=log_id, user_id=user_id, read_at=now))
    if unread_ids:
        db.commit()
    return len(unread_ids)


def send_goal_cheer(
    db: Session,
    sender_id: uuid.UUID,
    sender_name: str,
    goal_id: int,
    goal_name: str,
    emoji: str,
    message: str | None,
    now: datetime | None = None,
) -> int:
    """배우자가 목표에 언제든 응원을 보낸다(마일스톤 축하 알림에 반응을 남기는 것과 달리 25% 도달 전에도 가능).
    알림함(NotificationLog, notif_type="goal_cheer", related=goal)에 한 줄 남기고, 보낸 사람의 이모지·메시지는
    기존 리액션 모델로 그 알림에 붙인다 — 받는 쪽 인박스·홈이 기존 리액션 표시를 그대로 쓴다. 보낸 사람 본인에게는
    읽음 처리해 안 읽은 알림으로 잡히지 않게 한다. 새 알림 id를 반환한다."""
    if emoji not in REACTION_EMOJIS:
        raise InvalidReactionError("지원하지 않는 반응이에요.")
    now = now or now_kst()
    message = message.strip()[:200] or None if message else None
    detail = f'{sender_name}님이 "{goal_name}" 목표에 {emoji} 응원을 보냈어요'
    if message:
        detail += f": {message}"
    log = NotificationLog(
        notif_type="goal_cheer",
        related_type="goal",
        related_id=goal_id,
        # 응원은 dedupe 대상이 아니라 키가 필요 없지만 인박스가 year_month를 그대로 내려주므로 채워 둔다 —
        # 컬럼이 String(20)이라 마이크로초까지 붙은 isoformat()(26자)은 Postgres에서 거부된다.
        year_month=now.isoformat(timespec="seconds"),
        status="sent",
        detail=detail[:500],
    )
    db.add(log)
    db.flush()
    db.add(NotificationReaction(notification_log_id=log.id, user_id=sender_id, emoji=emoji, message=message))
    db.add(NotificationRead(notification_log_id=log.id, user_id=sender_id, read_at=now))
    db.commit()
    return log.id


PARTNER_SAVING_NOTIF_TYPE = "partner_saving"


def log_partner_saving(
    db: Session, actor_id: uuid.UUID, actor_name: str, tx: Transaction, now: datetime | None = None
) -> int | None:
    """한 사람이 저축·투자 상품에 납입(savings_product_id가 있는 거래)을 기록하면 알림함에 "OO님이 △△에 N원
    저축했어요"를 남겨 배우자가 바로 응원 반응을 달 수 있게 한다 — 서로의 저축이 보여야 동기부여가 된다.
    기록한 본인에게는 읽음 처리한다(send_goal_cheer와 같은 규칙). 사용자가 직접 입력한 거래에만 부른다(반복거래
    자동 생성·CSV 가져오기는 한꺼번에 쌓여 알림함을 덮으므로 제외). 꺼져 있거나 저축 거래가 아니면 None."""
    if tx.savings_product_id is None or tx.savings_product is None:
        return None
    if not notification_settings_service.is_enabled(db, PARTNER_SAVING_NOTIF_TYPE):
        return None
    now = now or now_kst()
    log = NotificationLog(
        notif_type=PARTNER_SAVING_NOTIF_TYPE,
        related_type="savings_product",
        related_id=tx.savings_product_id,
        # dedupe 대상이 아니다 — 컬럼이 String(20)이라 초 단위까지만(send_goal_cheer 참고).
        year_month=now.isoformat(timespec="seconds"),
        status="sent",
        detail=f"{actor_name}님이 \"{tx.savings_product.name}\"에 {tx.amount:,.0f}원 저축했어요"[:500],
    )
    db.add(log)
    db.flush()
    db.add(NotificationRead(notification_log_id=log.id, user_id=actor_id, read_at=now))
    db.commit()
    return log.id
