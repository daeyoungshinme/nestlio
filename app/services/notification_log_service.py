"""NotificationLog 기반 알림 중복 발송 방지 — "이 (종류, 기간/마일스톤 키, 대상)으로 이미 보냈는가"
확인과 발송 기록. notification_service(주간/월간 요약·예산 경고·목표 달성 축하)가 같은 테이블·같은 키
규칙을 쓰므로 여기 한 곳에 둔다. dedup 없는 "사건" 알림 기록(`log_event`)도 여기 있다. 다른 서비스를 import하지
않는 말단 모듈이라 어디서든 순환 없이 쓸 수 있다."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog
from app.models.notification_reaction import NotificationReaction
from app.models.notification_read import NotificationRead


def already_sent(db: Session, notif_type: str, period_key: str, related_id: int | None = None) -> bool:
    return (
        db.query(NotificationLog)
        .filter(
            NotificationLog.notif_type == notif_type,
            NotificationLog.year_month == period_key,
            NotificationLog.related_id == related_id,
        )
        .first()
        is not None
    )


def log_sent(
    db: Session,
    notif_type: str,
    period_key: str,
    related_id: int | None = None,
    related_type: str | None = None,
    detail: str = "",
) -> None:
    db.add(
        NotificationLog(
            notif_type=notif_type,
            related_type=related_type or ("category" if related_id else None),
            related_id=related_id,
            year_month=period_key,
            status="sent",
            detail=detail[:500],
        )
    )
    db.commit()


def log_event(
    db: Session,
    *,
    notif_type: str,
    related_type: str,
    related_id: int,
    detail: str,
    actor_id: uuid.UUID,
    now: datetime,
    reaction: tuple[str, str | None] | None = None,
) -> int:
    """dedup 없는 "사건" 알림(일정 변경·할일·목표 응원·배우자 저축)을 알림함에 남기고 행동한 본인은 바로 읽음 처리한다.
    `year_month`는 기간 키가 아니라 초 단위 시각이다(String(20) — 마이크로초까지 붙으면 Postgres가 거부).
    `reaction`(이모지, 메시지)을 주면 보낸 사람의 반응을 함께 붙인다(목표 응원).

    호출자는 같은 세션으로 응답을 직렬화하므로, 실패하면 롤백해 세션을 쓸 수 있는 상태로 돌려 놓고 예외를 올린다.
    새 알림 id를 반환한다."""
    log = NotificationLog(
        notif_type=notif_type,
        related_type=related_type,
        related_id=related_id,
        year_month=now.isoformat(timespec="seconds"),
        status="sent",
        detail=detail[:500],
    )
    try:
        db.add(log)
        db.flush()
        if reaction is not None:
            emoji, message = reaction
            db.add(NotificationReaction(notification_log_id=log.id, user_id=actor_id, emoji=emoji, message=message))
        db.add(NotificationRead(notification_log_id=log.id, user_id=actor_id, read_at=now))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return log.id


# 목표 달성 축하 메일을 보내는 진행률(%) 기준, 오름차순
MILESTONES = (25, 50, 75, 100)


def highest_crossed_milestone(progress_pct: Decimal, milestones: tuple[int, ...] = MILESTONES) -> int | None:
    """progress_pct(0~100)가 이미 넘어선 마일스톤 중 가장 높은 것을 반환한다 (없으면 None)."""
    reached = [m for m in milestones if progress_pct >= m]
    return max(reached) if reached else None


def milestone_already_logged(db: Session, notif_type: str, related_id: int, milestone: int) -> bool:
    """이 (notif_type, related_id) 조합이 이미 이 마일스톤으로 축하됐는지 — 재저장으로 같은
    마일스톤이 재발송되지 않도록 호출부(notification_service)가 이메일 발송 전에 확인한다.
    NotificationLog.year_month 칸에 기간 대신 마일스톤 값(str)을 키로 쓴다."""
    return already_sent(db, notif_type, str(milestone), related_id)


def log_milestone(db: Session, notif_type: str, related_type: str, related_id: int, milestone: int, detail: str) -> None:
    log_sent(db, notif_type, str(milestone), related_id, related_type, detail)
