import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.event import Event
from app.utils.dates import advance_due_date, now_kst

_MAX_OCCURRENCE_STEPS = 2000


class ImportedEventReadOnlyError(Exception):
    """Raised when an update/delete is attempted on a source='google_import' Event."""


def occurrences_in_range(event: Event, range_start: date, range_end: date) -> list[datetime]:
    """Expand a (possibly recurring) event into its occurrence datetimes within [range_start, range_end]."""
    if event.frequency == "once":
        d = event.start_at.date()
        return [event.start_at] if range_start <= d <= range_end else []

    limit = min(event.recurrence_end_date, range_end) if event.recurrence_end_date else range_end
    day_of_month = event.start_at.day
    time_of_day = event.start_at.time()

    occurrences: list[datetime] = []
    current = event.start_at.date()
    guard = 0
    while current <= limit and guard < _MAX_OCCURRENCE_STEPS:
        if current >= range_start:
            occurrences.append(datetime.combine(current, time_of_day))
        current = advance_due_date(current, event.frequency, day_of_month)
        guard += 1
    return occurrences


def to_out_dict(event: Event, occurrence_start: datetime | None = None) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "all_day": event.all_day,
        "start_at": event.start_at,
        "end_at": event.end_at,
        "frequency": event.frequency,
        "recurrence_end_date": event.recurrence_end_date,
        "reminder_minutes_before": event.reminder_minutes_before,
        "creator": event.creator,
        "assignee": event.assignee,
        "completed_at": event.completed_at,
        "source": event.source,
        "occurrence_start": occurrence_start if occurrence_start is not None else event.start_at,
    }


def list_events(db: Session, range_start: date, range_end: date) -> list[dict]:
    candidates = (
        db.query(Event)
        .filter(Event.start_at <= datetime.combine(range_end, datetime.max.time()))
        .filter(Event.dismissed_at.is_(None))
        .filter(
            (Event.frequency == "once")
            | (Event.recurrence_end_date.is_(None))
            | (Event.recurrence_end_date >= range_start)
        )
        .all()
    )
    results: list[dict] = []
    for event in candidates:
        for occurrence_start in occurrences_in_range(event, range_start, range_end):
            results.append(to_out_dict(event, occurrence_start))
    results.sort(key=lambda r: r["occurrence_start"])
    return results


def get_event(db: Session, event_id: int) -> Event | None:
    return db.get(Event, event_id)


def create_event(
    db: Session,
    created_by: uuid.UUID,
    title: str,
    start_at: datetime,
    description: str | None = None,
    location: str | None = None,
    all_day: bool = False,
    end_at: datetime | None = None,
    frequency: str = "once",
    recurrence_end_date: date | None = None,
    reminder_minutes_before: int | None = None,
    assignee_id: uuid.UUID | None = None,
) -> Event:
    from app.services import event_calendar_service, event_reminder_service

    event = Event(
        title=title,
        description=description,
        location=location,
        all_day=all_day,
        start_at=start_at,
        end_at=end_at,
        frequency=frequency,
        recurrence_end_date=recurrence_end_date,
        reminder_minutes_before=reminder_minutes_before,
        assignee_id=assignee_id,
        created_by=created_by,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    event_calendar_service.sync_to_google(db, event)
    event_reminder_service.notify_other_spouse(db, event, actor_id=created_by, action_label="새 일정이 등록되었습니다")
    return event


def update_event(db: Session, event_id: int, actor_id: uuid.UUID, **fields) -> Event | None:
    from app.services import event_calendar_service, event_reminder_service

    event = db.get(Event, event_id)
    if event is None:
        return None
    if event.source == "google_import":
        raise ImportedEventReadOnlyError("Google 캘린더에서 가져온 일정은 nestlio에서 수정할 수 없습니다.")
    for key, value in fields.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    event_calendar_service.sync_to_google(db, event)
    event_reminder_service.notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 변경되었습니다")
    return event


def delete_event(db: Session, event_id: int, actor_id: uuid.UUID, now: datetime | None = None) -> bool:
    from app.services import event_calendar_service, event_reminder_service

    now = now or now_kst()
    event = db.get(Event, event_id)
    if event is None:
        return False
    if event.source == "google_import":
        # 로컬 사본만 숨긴다 (User.removed_at과 동일한 소프트 삭제 패턴). 구글 캘린더의 원본 일정은
        # 사용자가 만든 것이 아니므로 google_calendar_service.delete_event를 호출해 실제로 지우지 않는다.
        event.dismissed_at = now
        db.commit()
        event_reminder_service.notify_other_spouse(db, event, actor_id=actor_id, action_label="Google 캘린더 일정이 목록에서 숨겨졌습니다")
        return True
    event_calendar_service.remove_from_google(event)
    event_reminder_service.notify_other_spouse(db, event, actor_id=actor_id, action_label="일정이 삭제되었습니다")
    db.delete(event)
    db.commit()
    return True


def set_completed(db: Session, event_id: int, completed: bool, now: datetime | None = None) -> Event | None:
    """완료 체크 토글 - google_import 일정도 허용한다(원본 내용 수정이 아니라 nestlio 로컬
    메타데이터일 뿐이므로 update_event의 ImportedEventReadOnlyError 가드를 적용하지 않는다).
    구글 캘린더에는 완료 개념이 없어 event_calendar_service.sync_to_google을 호출하지 않고, 체크박스
    토글마다 배우자에게 메일이 가면 과도하므로 event_reminder_service.notify_other_spouse도 호출하지
    않는다(담당자 배정 자체는 create_event/update_event가 이미 알린다)."""
    now = now or now_kst()
    event = db.get(Event, event_id)
    if event is None:
        return None
    event.completed_at = now if completed else None
    db.commit()
    db.refresh(event)
    return event
