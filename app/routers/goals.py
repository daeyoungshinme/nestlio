from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.financial_goal import FinancialGoalCreateIn, FinancialGoalOut, FinancialGoalUpdateIn
from app.services import goal_service, notification_service
from app.services.google_auth import is_connected

router = APIRouter(prefix="/financial-goals", tags=["financial-goals"])


@router.get("", response_model=list[FinancialGoalOut])
def list_goals(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return goal_service.list_goals(db)


@router.post("", response_model=FinancialGoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(payload: FinancialGoalCreateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    goal = goal_service.create_goal(
        db,
        payload.priority,
        payload.name,
        payload.target_age,
        payload.required_amount,
        payload.monthly_saving_amount,
        payload.current_amount,
    )
    if is_connected():
        notification_service.check_and_celebrate_goal_milestone(db, goal.id)
    return goal


@router.put("/{goal_id}", response_model=FinancialGoalOut)
def update_goal(
    goal_id: int,
    payload: FinancialGoalUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    goal = goal_service.update_goal(
        db,
        goal_id,
        payload.priority,
        payload.name,
        payload.target_age,
        payload.required_amount,
        payload.monthly_saving_amount,
        payload.current_amount,
    )
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "재무목표를 찾을 수 없습니다.")
    if is_connected():
        notification_service.check_and_celebrate_goal_milestone(db, goal.id)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    goal_service.delete_goal(db, goal_id)
