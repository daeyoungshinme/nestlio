import uuid
from datetime import date, datetime
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import InvalidInputError
from app.models.todo import Todo
from app.models.todo_completion import TodoCompletion
from app.models.user import User
from app.services import user_service
from app.utils.dates import advance_due_date, now_kst

_DONE_LIST_LIMIT = 50

# set_completed 결과 — 라우터가 알림을 고르는 데 쓴다. partial = 각자 완료 할일에서 내 몫만 체크(아직 남은 사람 있음).
CompleteOutcome = Literal["none", "partial", "completed", "reopened"]


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
    each_completes: bool = False,
    priority: str = "normal",
) -> Todo:
    _ensure_assignable(db, assignee_id)
    todo = Todo(
        title=title,
        memo=memo,
        due_date=due_date,
        frequency=frequency,
        recurrence_day=due_date.day if due_date else None,
        assignee_id=assignee_id,
        each_completes=each_completes,
        priority=priority,
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
    each_completes: bool = False,
    priority: str = "normal",
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
    # 각자 완료를 끄면 사람별 체크는 의미가 없어진다 — 할일은 진행 중 그대로 두고 체크만 지운다.
    if todo.each_completes and not each_completes:
        todo.completions.clear()
    todo.each_completes = each_completes
    todo.priority = priority
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
) -> tuple[Todo, CompleteOutcome] | None:
    """완료 체크 토글. (할일, 이번 호출의 결과)를 돌려준다(없으면 None).

    - 보통 할일: 누가 체크하든 바로 완료/완료 취소.
    - 각자 완료 할일(`each_completes`): 체크는 내 몫(TodoCompletion)만 기록하고, 가구의 활성 사용자 전원이
      체크했을 때 할일 전체가 완료된다(제거된 배우자는 세지 않는다 — 혼자 남은 가구는 한 명이 체크하면 끝).
      체크를 풀면 내 몫을 지우고, 할일이 완료 상태였으면 다시 연다.

    완료 상태 전환은 조건부 UPDATE라 두 사람이 동시에 체크하거나 더블클릭해도 한 호출만 전환에 성공한다 —
    다음 회차 생성과 알림은 전환에 성공한 호출만 한다."""
    now = now or now_kst()
    todo = db.get(Todo, todo_id)
    if todo is None:
        return None
    if todo.each_completes:
        outcome = _set_own_part(db, todo, completed, actor_id, now)
    elif _transition(db, todo, completed, actor_id, now):
        outcome = "completed" if completed else "reopened"
    else:
        outcome = "none"
    db.commit()
    db.refresh(todo)
    return todo, outcome


def _transition(db: Session, todo: Todo, completed: bool, actor_id: uuid.UUID, now: datetime) -> bool:
    """할일 전체의 완료 상태를 바꾼다. 이 호출이 전환에 성공했을 때만 True(다음 회차 생성·삭제도 그때만)."""
    is_open_now = Todo.completed_at.is_(None) if completed else Todo.completed_at.isnot(None)
    result = db.execute(
        update(Todo)
        .where(Todo.id == todo.id, is_open_now)
        .values(completed_at=now if completed else None, completed_by=actor_id if completed else None)
        .execution_options(synchronize_session=False)
    )
    changed = result.rowcount == 1
    if changed:
        if completed:
            _create_next_occurrence(db, todo, now.date())
        else:
            _delete_open_next_occurrence(db, todo.id)
    return changed


def _set_own_part(db: Session, todo: Todo, completed: bool, actor_id: uuid.UUID, now: datetime) -> CompleteOutcome:
    # 두 사람이 거의 동시에 마지막 체크를 하면 서로의 미커밋 체크를 못 보고 둘 다 "아직 남음"으로 판단할 수 있다.
    # 할일 행을 잠가 직렬화한다(Postgres). 테스트용 SQLite는 FOR UPDATE를 무시한다.
    db.execute(select(Todo.id).where(Todo.id == todo.id).with_for_update())
    mine = db.get(TodoCompletion, (todo.id, actor_id))
    if not completed:
        if mine is not None:
            db.delete(mine)
            db.flush()
        return "reopened" if _transition(db, todo, False, actor_id, now) else "none"

    added = False
    if mine is None:
        db.add(TodoCompletion(todo_id=todo.id, user_id=actor_id, completed_at=now))
        try:
            db.flush()
        except IntegrityError:  # 같은 사람의 더블클릭이 먼저 기록됨 — 그쪽 호출이 처리한다
            db.rollback()
            return "none"
        added = True
    checked = set(db.scalars(select(TodoCompletion.user_id).where(TodoCompletion.todo_id == todo.id)))
    everyone = {user.id for user in user_service.list_users(db)}
    if everyone <= checked and _transition(db, todo, True, actor_id, now):
        return "completed"
    return "partial" if added else "none"


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
            each_completes=todo.each_completes,
            priority=todo.priority,
            previous_todo_id=todo.id,
            created_by=todo.created_by,
        )
    )


def _delete_open_next_occurrence(db: Session, todo_id: int) -> None:
    """완료 취소 — 그 완료로 생긴 다음 회차가 아직 진행 중이면 없앤다. 이미 끝낸 회차는 기록이라 남긴다."""
    next_todo = _next_occurrence(db, todo_id)
    if next_todo is not None and next_todo.completed_at is None:
        db.delete(next_todo)
