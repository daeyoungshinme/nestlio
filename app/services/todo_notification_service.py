"""할일 변경을 배우자에게 알린다. todo_service는 알림을 모르고 라우터가 저장 뒤에 이 모듈을 부른다
(event_service ↔ event_reminder_service와 같은 구조). 알림 실패가 저장 응답을 막지 않도록 공개 함수는
예외를 던지지 않는다.

일정과 달리 인앱 알림(NotificationLog)이 정본이라 Gmail이 끊겨도 배우자가 알 수 있다. 메일은 할 일이 새로
생긴 경우(등록·담당 변경)에만 보낸다 — 체크박스 토글마다 메일이 가면 과하다. 수정은 담당이 바뀔 때만,
자기 혼자의 할일(작성자·담당이 모두 본인)은 알리지 않는다."""
import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.todo import Todo
from app.models.user import User
from app.services import (
    email_templates,
    notification_log_service,
    notification_service,
    notification_settings_service,
)
from app.utils.dates import now_kst

logger = logging.getLogger(__name__)

NOTIF_TYPE = "todo"


def _log_inbox(db: Session, todo: Todo, actor: User, detail: str, now: datetime) -> None:
    notification_log_service.log_event(
        db,
        notif_type=NOTIF_TYPE,
        related_type="todo",
        related_id=todo.id,
        detail=detail,
        actor_id=actor.id,
        now=now,
    )


def _notify_assigned(db: Session, todo: Todo, actor: User, inbox_text: str, mail_label: str, now: datetime) -> None:
    """알림함 + 메일. 인앱 기록이 실패해도 메일은 시도한다(둘은 서로 다른 전달 경로다). 설정 조회가 실패하면
    꺼져 있을 수도 있으니 둘 다 보내지 않는다(일정 알림과 같은 규칙)."""
    title = todo.title
    try:
        if not notification_settings_service.is_enabled(db, NOTIF_TYPE):
            return
    except Exception:
        logger.exception("할일 알림 설정 조회 실패 (할일은 정상 저장됨): %s", title)
        return
    try:
        _log_inbox(db, todo, actor, f"{actor.display_name}님이 {inbox_text}: {title}", now)
    except Exception:
        logger.exception("할일 인앱 알림 기록 실패 (할일은 정상 저장됨): %s", title)
    try:
        notification_service.send_email_best_effort(
            db,
            f"[Nestlio] {mail_label}: {title}",
            email_templates.todo_summary_text(todo, header=mail_label),
            to=notification_settings_service.recipients_excluding(db, actor.id),
        )
    except Exception:
        logger.exception("할일 알림 이메일 처리 실패 (할일은 정상 저장됨): %s", title)


def _involves_partner(created_by: uuid.UUID, assignee_id: uuid.UUID | None, actor: User) -> bool:
    return created_by != actor.id or assignee_id != actor.id


def _notify_inbox_only(db: Session, todo: Todo, actor: User, inbox_text: str, now: datetime) -> None:
    try:
        if not notification_settings_service.is_enabled(db, NOTIF_TYPE):
            return
        _log_inbox(db, todo, actor, f"{actor.display_name}님이 {inbox_text}: {todo.title}", now)
    except Exception:
        logger.exception("할일 인앱 알림 기록 실패 (할일은 정상 저장됨): todo_id=%s", todo.id)


def notify_created(db: Session, todo: Todo, actor: User, now: datetime | None = None) -> None:
    if todo.assignee_id == actor.id:
        return
    _notify_assigned(db, todo, actor, "새 할일을 등록했어요", "새 할일이 등록되었습니다", now or now_kst())


def notify_assignee_changed(
    db: Session, todo: Todo, previous_assignee_id: uuid.UUID | None, actor: User, now: datetime | None = None
) -> None:
    if todo.assignee_id == previous_assignee_id or todo.assignee_id == actor.id:
        return
    _notify_assigned(db, todo, actor, "할일 담당을 바꿨어요", "할일 담당이 변경되었습니다", now or now_kst())


def notify_completed(db: Session, todo: Todo, actor: User, now: datetime | None = None) -> None:
    if _involves_partner(todo.created_by, todo.assignee_id, actor):
        _notify_inbox_only(db, todo, actor, "할일을 완료했어요", now or now_kst())


def notify_own_part_done(db: Session, todo: Todo, actor: User, now: datetime | None = None) -> None:
    """각자 완료 할일에서 한 사람이 자기 몫만 끝냈을 때 — 남은 배우자가 알도록 알림함에만 남긴다."""
    _notify_inbox_only(db, todo, actor, "할일에서 자기 몫을 완료했어요", now or now_kst())


def notify_deleted(db: Session, todo: Todo, actor: User, now: datetime | None = None) -> None:
    if _involves_partner(todo.created_by, todo.assignee_id, actor):
        _notify_inbox_only(db, todo, actor, "할일을 삭제했어요", now or now_kst())
