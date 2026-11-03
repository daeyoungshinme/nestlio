import uuid
from datetime import date, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.errors import InvalidInputError
from app.models.todo import Todo
from app.models.user import User
from app.utils.dates import advance_due_date, now_kst

_DONE_LIST_LIMIT = 50


class TodoAssigneeNotFoundError(InvalidInputError):
    pass


def _ensure_assignable(db: Session, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is None:
        return
    user = db.get(User, assignee_id)
    if user is None or user.removed_at is not None:
        raise TodoAssigneeNotFoundError("담당자를 찾을 수 없습니다.")


def list_todos(db: Session, status: str) -> list[Todo]:
    """진행 중은 기한 빠른 순(기한 없음은 맨 뒤), 완료는 최근에 끝낸 순."""
    query = db.query(Todo)
    if status == "open":
        return (
            query.filter(Todo.completed_at.is_(None))
            .order_by(Todo.due_date.is_(None), Todo.due_date, Todo.created_at, Todo.id)
            .all()
        )
    return (
        query.filter(Todo.completed_at.isnot(None))
        .order_by(Todo.completed_at.desc(), Todo.id.desc())
        .limit(_DONE_LIST_LIMIT)
        .all()
    )


def create_todo(
    db: Session,
    created_by: uuid.UUID,
    title: str,
    memo: str | None = None,
    due_date: date | None = None,
    frequency: str = "once",
    assignee_id: uuid.UUID | None = None,
) -> Todo:
    _ensure_assignable(db, assignee_id)
    todo = Todo(
        title=title,
        memo=memo,
        due_date=due_date,
        frequency=frequency,
        recurrence_day=due_date.day if due_date else None,
        assignee_id=assignee_id,
        created_by=created_by,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


def update_todo(
    db: Session,
    todo_id: int,
    title: str,
    memo: str | None,
    due_date: date | None,
    frequency: str,
    assignee_id: uuid.UUID | None,
) -> tuple[Todo, uuid.UUID | None] | None:
    """(수정한 할일, 수정 전 담당자)를 돌려준다(없으면 None) — 라우터가 담당 변경 알림을 판단하는 데 쓴다."""
    todo = db.get(Todo, todo_id)
    if todo is None:
        return None
    previous_assignee_id = todo.assignee_id
    # 이미 제거된 배우자가 담당인 할일도 다른 칸은 고칠 수 있게, 담당자를 새로 지정할 때만 검증한다.
    if assignee_id != previous_assignee_id:
        _ensure_assignable(db, assignee_id)
    # 기한이 그대로면 기준일을 건드리지 않는다 — 31일 반복이 2월 28일 회차에서 수정되어도 3월 31일로 돌아오게.
    if due_date != todo.due_date:
        todo.recurrence_day = due_date.day if due_date else None
    todo.title = title
    todo.memo = memo
    todo.due_date = due_date
    todo.frequency = frequency
    todo.assignee_id = assignee_id
    db.commit()
    db.refresh(todo)
    return todo, previous_assignee_id


def delete_todo(db: Session, todo_id: int) -> Todo | None:
    """삭제한 할일을 돌려준다(없으면 None) — 커밋 후 detached여도 이미 로드된 컬럼은 그대로 읽혀
    호출부가 배우자 알림(todo_notification_service.notify_deleted)에 쓸 수 있다."""
    todo = db.get(Todo, todo_id)
    if todo is None:
        return None
    db.delete(todo)
    db.commit()
    return todo


def set_completed(
    db: Session, todo_id: int, completed: bool, actor_id: uuid.UUID, now: datetime | None = None
) -> tuple[Todo, bool] | None:
    """완료 체크 토글. (할일, 이번 호출로 상태가 바뀌었는지)를 돌려준다(없으면 None).
    상태 전환을 조건부 UPDATE로 해서, 두 사람이 동시에 체크하거나 더블클릭해도 한 호출만 전환에 성공한다 —
    다음 회차 생성과 알림은 전환에 성공한 호출만 한다."""
    now = now or now_kst()
    todo = db.get(Todo, todo_id)
    if todo is None:
        return None
    is_open_now = Todo.completed_at.is_(None) if completed else Todo.completed_at.isnot(None)
    result = db.execute(
        update(Todo)
        .where(Todo.id == todo_id, is_open_now)
        .values(completed_at=now if completed else None, completed_by=actor_id if completed else None)
        .execution_options(synchronize_session=False)
    )
    changed = result.rowcount == 1
    if changed:
        if completed:
            _create_next_occurrence(db, todo, now.date())
        else:
            _delete_open_next_occurrence(db, todo_id)
    db.commit()
    db.refresh(todo)
    return todo, changed


def _next_occurrence(db: Session, todo_id: int) -> Todo | None:
    return db.query(Todo).filter(Todo.previous_todo_id == todo_id).first()


def _next_due_date(todo: Todo, today: date) -> date:
    """오늘 이후 첫 회차 — 3주 밀린 주간 할일을 끝내도 이미 지난 회차가 쌓이지 않는다."""
    current = advance_due_date(todo.due_date, todo.frequency, todo.recurrence_day)
    while current <= today:
        current = advance_due_date(current, todo.frequency, todo.recurrence_day)
    return current


def _create_next_occurrence(db: Session, todo: Todo, today: date) -> None:
    # 완료를 취소했다가 다시 완료해도, 이미 끝낸 다음 회차가 남아 있으면 새로 만들지 않는다.
    if todo.frequency == "once" or todo.due_date is None or _next_occurrence(db, todo.id) is not None:
        return
    db.add(
        Todo(
            title=todo.title,
            memo=todo.memo,
            due_date=_next_due_date(todo, today),
            frequency=todo.frequency,
            recurrence_day=todo.recurrence_day,
            assignee_id=todo.assignee_id,
            previous_todo_id=todo.id,
            created_by=todo.created_by,
        )
    )


def _delete_open_next_occurrence(db: Session, todo_id: int) -> None:
    """완료 취소 — 그 완료로 생긴 다음 회차가 아직 진행 중이면 없앤다. 이미 끝낸 회차는 기록이라 남긴다."""
    next_todo = _next_occurrence(db, todo_id)
    if next_todo is not None and next_todo.completed_at is None:
        db.delete(next_todo)
