import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.services import event_service, gmail_service, notification_settings_service
from app.services.google_auth import is_connected

logger = logging.getLogger(__name__)


def send_due_reminders(db: Session, now: datetime, window_minutes: int = 30) -> int:
    """Send reminder emails for occurrences whose reminder time has arrived (or arrives within
    `window_minutes`) and whose event is still upcoming. Meant to be called by a periodic
    scheduler job — catch-up safe: a missed/delayed tick is recovered on the next run, and
    NotificationLog dedup prevents duplicate sends."""
    if not is_connected():
        return 0
    if not notification_settings_service.is_enabled(db, "event_reminder"):
        return 0

    sent = 0
    candidates = db.query(Event).filter(Event.reminder_minutes_before.isnot(None)).all()
    due_pairs = [
        (event, occurrence) for event in candidates for occurrence in _due_occurrences(event, now, window_minutes)
    ]
    already_notified = _already_notified_pairs(db, {event.id for event, _ in due_pairs})
    for event, occurrence in due_pairs:
        if (event.id, occurrence.isoformat()) in already_notified:
            continue
        _send_reminder_email(db, event, occurrence)
        _log_notified(db, event.id, occurrence)
        sent += 1
    return sent


def _due_occurrences(event: Event, now: datetime, window_minutes: int) -> list[datetime]:
    lead = timedelta(minutes=event.reminder_minutes_before)
    range_start = now.date()
    range_end = (now + lead + timedelta(days=1)).date()
    due = []
    for occurrence in event_service.occurrences_in_range(event, range_start, range_end):
        reminder_at = occurrence - lead
        # 리마인더 시각이 도래했고(윈도우 안에 들어왔고) 일정 자체는 아직 미래면 발송 대상.
        # 지난 틱이 밀려서 reminder_at이 now보다 과거여도 잡는다 — 중복은 dedup이 막는다.
        if reminder_at <= now + timedelta(minutes=window_minutes) and now < occurrence:
            due.append(occurrence)
    return due


def _already_notified_pairs(db: Session, event_ids: set[int]) -> set[tuple[int, str]]:
    """(event_id, occurrence.isoformat()) 쌍을 한 번의 쿼리로 모아온다 — occurrence마다
    개별 SELECT를 던지던 이전 방식(N+1)을 피하기 위함."""
    if not event_ids:
        return set()
    rows = (
        db.query(NotificationLog.related_id, NotificationLog.year_month)
        .filter(
            NotificationLog.notif_type == "event_reminder",
            NotificationLog.related_id.in_(event_ids),
        )
        .all()
    )
    return {(related_id, year_month) for related_id, year_month in rows}


def _log_notified(db: Session, event_id: int, occurrence: datetime) -> None:
    db.add(
        NotificationLog(
            notif_type="event_reminder",
            related_type="event",
            related_id=event_id,
            year_month=occurrence.isoformat(),
            status="sent",
        )
    )
    db.commit()


def _send_reminder_email(db: Session, event: Event, occurrence: datetime) -> None:
    body = _event_summary_text(event, occurrence)
    try:
        gmail_service.send_email(
            f"[Nestlio] 일정 리마인더: {event.title}", body, to=notification_settings_service.get_recipients(db)
        )
    except Exception:  # best-effort 부수효과, 로그만 남기고 진행
        logger.exception("일정 리마인더 이메일 발송 실패: %s", event.title)


def notify_other_spouse(db: Session, event: Event, actor_id: uuid.UUID, action_label: str) -> None:
    """설정된 수신자 목록(notification_settings_service.get_recipients) 중 행위자 본인 이메일은
    제외하고 보낸다 - 자기 자신에게 "방금 내가 한 행동" 메일을 보낼 필요는 없기 때문. 다른 발송
    경로(notification_service)와 달리 이 함수만 행위자를 배제하는 이유가 여기 있다."""
    if not is_connected():
        return
    actor = db.get(User, actor_id)
    recipients = [email for email in notification_settings_service.get_recipients(db) if actor is None or email != actor.email]
    if not recipients:
        return
    body = _event_summary_text(event, event.start_at, header=action_label)
    try:
        gmail_service.send_email(f"[Nestlio] {action_label}: {event.title}", body, to=recipients)
    except Exception:  # best-effort 부수효과, 로그만 남기고 진행
        logger.exception("일정 알림 이메일 발송 실패: %s", event.title)


def _event_summary_text(event: Event, when: datetime, header: str | None = None) -> str:
    lines = [header] if header else []
    lines.append(event.title)
    lines.append(f"일시: {when.strftime('%Y-%m-%d %H:%M')}")
    if event.location:
        lines.append(f"장소: {event.location}")
    if event.description:
        lines.append("")
        lines.append(event.description)
    return "\n".join(lines)
