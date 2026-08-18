from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.annual_savings_goal import (
    AnnualSavingsGoalOut,
    AnnualSavingsGoalSuggestionOut,
    AnnualSavingsGoalUpsertIn,
)
from app.services import annual_savings_goal_service

router = APIRouter(prefix="/annual-savings-goals", tags=["annual-savings-goals"])


@router.get("", response_model=list[AnnualSavingsGoalOut])
def list_goals(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today()
    return [annual_savings_goal_service.to_out(db, goal, today) for goal in annual_savings_goal_service.list_goals(db)]


@router.get("/suggestion", response_model=AnnualSavingsGoalSuggestionOut)
def get_suggestion(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return annual_savings_goal_service.suggested_targets(db, date.today())


@router.get("/{year}", response_model=AnnualSavingsGoalOut)
def get_goal(year: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    goal = annual_savings_goal_service.get_goal(db, year)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "해당 연도의 저축목표가 없습니다.")
    return annual_savings_goal_service.to_out(db, goal, date.today())


@router.put("/{year}", response_model=AnnualSavingsGoalOut)
def upsert_goal(
    year: int,
    payload: AnnualSavingsGoalUpsertIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    goal = annual_savings_goal_service.upsert_goal(
        db, year, [mt.model_dump() for mt in payload.monthly_targets]
    )
    return annual_savings_goal_service.to_out(db, goal, date.today())


@router.delete("/{year}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(year: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    annual_savings_goal_service.delete_goal(db, year)
