import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.services import (
    email_templates,
    event_service,
    notification_log_service,
    notification_service,
    notification_settings_service,
)

logger = logging.getLogger(__name__)

NOTIF_TYPE = "event_reminder"


def send_due_reminders(db: Session, now: datetime, window_minutes: int = 30) -> int:
    """Remind about occurrences whose reminder time has arrived (or arrives within `window_minutes`)
    and whose event is still upcoming. Meant to be called by a periodic scheduler job — catch-up
    safe: a missed/delayed tick is recovered on the next run, and NotificationLog dedup prevents
    duplicate sends. 인앱 알림은 Google 연결과 무관하게 남고, 메일은 연결돼 있을 때만 간다.
    반환값은 이번 틱에 기록(=알림)한 리마인더 수."""
    if not notification_settings_service.is_enabled(db, NOTIF_TYPE):
        return 0

    candidates = (
        db.query(Event)
        .filter(Event.reminder_minutes_before.isnot(None))
        .all()
    )
    due_pairs = [
        (event, occurrence) for event in candidates for occurrence in _due_occurrences(event, now, window_minutes)
    ]
    already_notified = _already_notified_pairs(db, {event.id for event, _ in due_pairs})
    reminded = 0
    for event, occurrence in due_pairs:
        if (event.id, occurrence.isoformat()) in already_notified:
            continue
        try:
            if _remind(db, event, occurrence):
                reminded += 1
        except Exception:
            # 한 건의 실패가 세션을 오염시켜 나머지 리마인더의 log_sent 커밋까지 막지 않도록 롤백.
            db.rollback()
            logger.exception("event_reminder_failed event_id=%s", event.id)
    return reminded


def _remind(db: Session, event: Event, occurrence: datetime) -> bool:
    body = email_templates.event_summary_text(event, occurrence)
    result = notification_service.send_email_best_effort(db, f"[Nestlio] 일정 리마인더: {event.title}", body)
    # Gmail 일시 오류("failed")면 기록하지 않는다 — "보냄"으로 남기면 장애 한 번에 리마인더가 영구
    # 유실된다. 기록이 없으면 다음 틱(일정 시작 전까지)에 다시 시도한다. 미연결·토큰 만료("skipped")는
    # 재시도해도 같으므로 인앱 알림만 남긴다.
    if result == "failed":
        return False
    notification_log_service.log_sent(
        db, NOTIF_TYPE, occurrence.isoformat(), related_id=event.id, related_type="event", detail=body
    )
    return True


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
    notification_log_service.already_sent를 부르면 N+1이 된다. 키 규칙은 _remind의 log_sent와 같다."""
    if not event_ids:
        return set()
    rows = (
        db.query(NotificationLog.related_id, NotificationLog.year_month)
        .filter(
            NotificationLog.notif_type == NOTIF_TYPE,
            NotificationLog.related_id.in_(event_ids),
        )
        .all()
    )
    return {(related_id, year_month) for related_id, year_month in rows}


def notify_other_spouse_best_effort(db: Session, event: Event, actor_id: uuid.UUID, action_label: str) -> None:
    """일정 생성·수정·삭제 직후 라우터가 호출한다. 설정된 수신자 중 행위자 본인 이메일은 빼고 보낸다 —
    자기 자신에게 "방금 내가 한 행동" 메일을 보낼 필요는 없다(다른 알림과 달리 이 경로만 행위자를 배제).
    메일 전용이라 인앱 알림은 남기지 않고, 실패해도 일정은 이미 저장됐으니 로그만 남긴다."""
    try:
        actor = db.get(User, actor_id)
        recipients = [
            email for email in notification_settings_service.get_recipients(db) if actor is None or email != actor.email
        ]
        body = email_templates.event_summary_text(event, event.start_at, header=action_label)
        notification_service.send_email_best_effort(
            db, f"[Nestlio] {action_label}: {event.title}", body, to=recipients
        )
    except Exception:
        logger.exception("일정 알림 이메일 처리 실패 (일정은 정상 저장됨): %s", event.title)
