"""NotificationLog 기반 알림 중복 발송 방지 — "이 (종류, 기간/마일스톤 키, 대상)으로 이미 보냈는가"
확인과 발송 기록. notification_service(주간/월간 요약·예산 경고)와 milestone_service(목표 달성
축하)가 같은 테이블·같은 키 규칙을 쓰므로 여기 한 곳에 둔다."""

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
