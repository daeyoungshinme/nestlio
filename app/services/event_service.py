import uuid
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.errors import InvalidInputError
from app.models.event import Event
from app.models.event_occurrence_completion import EventOccurrenceCompletion
from app.services import recurring_service, user_service
from app.utils.dates import advance_due_date, month_bounds, now_kst

_MAX_OCCURRENCE_STEPS = 2000


class EventOccurrenceNotFoundError(InvalidInputError):
    pass


class EventAssigneeNotFoundError(InvalidInputError):
    pass


def _ensure_assignable(db: Session, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is not None and user_service.get_active_user(db, assignee_id) is None:
        raise EventAssigneeNotFoundError("담당자를 찾을 수 없습니다.")


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


def occurrence_completed_at(event: Event, occurrence_start: datetime) -> datetime | None:
    """그 회차의 완료 시각 — 단건은 일정 자체의 상태, 반복은 회차별 기록."""
    if event.frequency == "once":
        return event.completed_at
    occurrence_date = occurrence_start.date()
    for completion in event.occurrence_completions:
        if completion.occurrence_date == occurrence_date:
            return completion.completed_at
    return None


def to_out_dict(event: Event, occurrence_start: datetime | None = None) -> dict:
    occurrence_start = occurrence_start if occurrence_start is not None else event.start_at
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
        "completed_at": occurrence_completed_at(event, occurrence_start),
        "occurrence_start": occurrence_start,
    }


def list_events(db: Session, range_start: date, range_end: date) -> list[dict]:
    candidates = (
        db.query(Event)
        .options(selectinload(Event.occurrence_completions))
        .filter(Event.start_at <= datetime.combine(range_end, datetime.max.time()))
        .filter(
            # 단건은 시작일로만 펼친다(occurrences_in_range) — 지난 단건 일정을 전부 읽어 파이썬에서 버리지 않게.
            ((Event.frequency == "once") & (Event.start_at >= datetime.combine(range_start, datetime.min.time())))
            | ((Event.frequency != "once") & Event.recurrence_end_date.is_(None))
            | ((Event.frequency != "once") & (Event.recurrence_end_date >= range_start))
        )
        .all()
    )
    results: list[dict] = []
    for event in candidates:
        for occurrence_start in occurrences_in_range(event, range_start, range_end):
            results.append(to_out_dict(event, occurrence_start))
    results.sort(key=lambda r: r["occurrence_start"])
    return results


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
    _ensure_assignable(db, assignee_id)
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
    return event


def update_event(db: Session, event_id: int, **fields) -> Event | None:
    event = db.get(Event, event_id)
    if event is None:
        return None
    # 이미 지정돼 있던 담당자는 제거됐어도 일정의 다른 칸을 고칠 수 있게 둔다.
    if "assignee_id" in fields and fields["assignee_id"] != event.assignee_id:
        _ensure_assignable(db, fields["assignee_id"])
    schedule_changed = any(
        key in fields and fields[key] != getattr(event, key) for key in ("frequency", "start_at", "recurrence_end_date")
    )
    for key, value in fields.items():
        setattr(event, key, value)
    if schedule_changed:
        _drop_stale_completions(event)
    db.commit()
    db.refresh(event)
    return event


def _drop_stale_completions(event: Event) -> None:
    """반복 규칙·시작일·종료일이 바뀐 뒤 새 일정에 없는 날짜의 회차 완료 기록을 지운다 — 남겨 두면 나중에 그 날짜가
    다시 회차가 될 때(예: 매주 → 매월로 바꿨다가 되돌림) 하지 않은 회차가 완료로 보인다. 단건↔반복 전환이면 상대
    쪽 완료 상태(단건 `completed_at`, 반복 회차 기록)도 비운다."""
    if event.frequency == "once":
        event.occurrence_completions.clear()
        return
    event.completed_at = None
    event.occurrence_completions[:] = [
        c for c in event.occurrence_completions if occurrences_in_range(event, c.occurrence_date, c.occurrence_date)
    ]


def delete_event(db: Session, event_id: int) -> Event | None:
    """삭제한 일정을 돌려준다(없으면 None) — 커밋 후 detached여도 이미 로드된 컬럼은 그대로 읽혀
    호출부가 배우자 알림(event_reminder_service.notify_other_spouse_best_effort)에 쓸 수 있다."""
    event = db.get(Event, event_id)
    if event is None:
        return None
    db.delete(event)
    db.commit()
    return event


def set_completed(
    db: Session,
    event_id: int,
    completed: bool,
    occurrence_date: date | None = None,
    now: datetime | None = None,
) -> dict | None:
    """완료 체크 토글. 응답용 dict를 돌려준다(반복 일정은 그 회차 기준). 단건은 일정 자체를, 반복은
    occurrence_date 회차만 바꾼다 — 실제 회차가 아닌 날짜면 EventOccurrenceNotFoundError.
    체크박스 토글마다 배우자에게 메일이 가면 과도하므로 라우터가 배우자 알림을 보내지 않는다(담당자 배정 자체는
    생성·수정 알림이 이미 알린다)."""
    now = now or now_kst()
    event = db.get(Event, event_id)
    if event is None:
        return None
    if event.frequency == "once":
        event.completed_at = now if completed else None
        db.commit()
        db.refresh(event)
        return to_out_dict(event)
    occurrences = occurrences_in_range(event, occurrence_date, occurrence_date) if occurrence_date else []
    if not occurrences:
        raise EventOccurrenceNotFoundError("일정의 회차를 찾을 수 없습니다.")
    _set_occurrence_completed(db, event, occurrence_date, completed, now)
    db.refresh(event)
    return to_out_dict(event, occurrences[0])


def _set_occurrence_completed(db: Session, event: Event, occurrence_date: date, completed: bool, now: datetime) -> None:
    existing = db.get(EventOccurrenceCompletion, (event.id, occurrence_date))
    if completed and existing is None:
        db.add(EventOccurrenceCompletion(event_id=event.id, occurrence_date=occurrence_date, completed_at=now))
    elif not completed and existing is not None:
        db.delete(existing)
    try:
        db.commit()
    except IntegrityError:
        # 두 사람이 같은 회차를 동시에 체크 — 이미 완료됐으니 먼저 저장된 기록을 그대로 쓴다.
        db.rollback()


def list_view(db: Session, date_from: date | None, date_to: date | None, today: date) -> dict:
    """일정 화면 응답(`EventListOut`) — 기간 안의 일정(반복 전개 포함)과 그 기간에 예정된 반복 거래. 기간을 비우면
    이번 달."""
    default_from, default_to = month_bounds(today)
    df = date_from or default_from
    dt = date_to or default_to
    return {
        "items": list_events(db, df, dt),
        "recurring_due": recurring_service.due_in_range(db, df, dt),
    }
