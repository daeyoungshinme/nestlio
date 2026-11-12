from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.todo import TodoCompleteIn, TodoCreateIn, TodoOut, TodoStatus, TodoUpdateIn
from app.services import todo_notification_service, todo_service

router = APIRouter(prefix="/todos", tags=["todos"])

_NOT_FOUND_DETAIL = "할일을 찾을 수 없습니다."


@router.get("", response_model=list[TodoOut])
def list_todos(
    status: TodoStatus = "open",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return todo_service.list_todos(db, status)


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(
    payload: TodoCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = todo_service.create_todo(
        db,
        created_by=current_user.id,
        title=payload.title,
        memo=payload.memo,
        due_date=payload.due_date,
        frequency=payload.frequency,
        assignee_id=payload.assignee_id,
        each_completes=payload.each_completes,
    )
    todo_notification_service.notify_created(db, todo, current_user)
    return todo


@router.put("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    payload: TodoUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = todo_service.update_todo(
        db,
        todo_id,
        title=payload.title,
        memo=payload.memo,
        due_date=payload.due_date,
        frequency=payload.frequency,
        assignee_id=payload.assignee_id,
        each_completes=payload.each_completes,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    todo, previous_assignee_id = result
    todo_notification_service.notify_assignee_changed(db, todo, previous_assignee_id, current_user)
    return todo


@router.patch("/{todo_id}/complete", response_model=TodoOut)
def complete_todo(
    todo_id: int,
    payload: TodoCompleteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = todo_service.set_completed(db, todo_id, completed=payload.completed, actor_id=current_user.id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    todo, outcome = result
    if outcome == "completed":
        todo_notification_service.notify_completed(db, todo, current_user)
    elif outcome == "partial":
        todo_notification_service.notify_own_part_done(db, todo, current_user)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = todo_service.delete_todo(db, todo_id)
    if deleted is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    todo_notification_service.notify_deleted(db, deleted, current_user)
