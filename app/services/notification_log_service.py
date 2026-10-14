"""NotificationLog 기반 알림 중복 발송 방지 — "이 (종류, 기간/마일스톤 키, 대상)으로 이미 보냈는가"
확인과 발송 기록. notification_service(주간/월간 요약·예산 경고·목표 달성 축하)가 같은 테이블·같은 키
규칙을 쓰므로 여기 한 곳에 둔다. 다른 서비스를 import하지 않는 말단 모듈이라 어디서든 순환 없이 쓸 수 있다."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog


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
