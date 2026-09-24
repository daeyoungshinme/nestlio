from decimal import Decimal

from sqlalchemy.orm import Session

from app.services import notification_log_service

# progress-percent thresholds that trigger a "milestone reached" celebration email, ascending
MILESTONES = (25, 50, 75, 100)


def highest_crossed(progress_pct: Decimal, milestones: tuple[int, ...] = MILESTONES) -> int | None:
    """progress_pct(0~100)가 이미 넘어선 마일스톤 중 가장 높은 것을 반환한다 (없으면 None)."""
    reached = [m for m in milestones if progress_pct >= m]
    return max(reached) if reached else None


def already_logged(db: Session, notif_type: str, related_id: int, milestone: int) -> bool:
    """이 (notif_type, related_id) 조합이 이미 이 마일스톤으로 축하됐는지 — 재저장으로 같은
    마일스톤이 재발송되지 않도록 호출부(notification_service)가 이메일 발송 전에 확인한다.
    NotificationLog.year_month 칸에 기간 대신 마일스톤 값(str)을 키로 쓴다."""
    return notification_log_service.already_sent(db, notif_type, str(milestone), related_id)


def log(db: Session, notif_type: str, related_type: str, related_id: int, milestone: int, detail: str) -> None:
    notification_log_service.log_sent(db, notif_type, str(milestone), related_id, related_type, detail)
