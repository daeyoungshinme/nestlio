import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.financial_goal import (
    FinancialGoalCreateIn,
    FinancialGoalOut,
    FinancialGoalUpdateIn,
    GrowlioGoalSettingsOut,
)
from app.services import goal_service, notification_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError

router = APIRouter(prefix="/financial-goals", tags=["financial-goals"])
logger = logging.getLogger(__name__)


@router.get("/growlio-goal", response_model=GrowlioGoalSettingsOut)
def get_growlio_goal(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """재무목표 신규 작성 폼을 미리 채우기 위해 growlio 투자목표 설정값을 프록시로 조회한다."""
    try:
        return goal_service.fetch_growlio_goal_settings(bearer_token)
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.get("", response_model=list[FinancialGoalOut])
def list_goals(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today()
    return [goal_service.to_out(db, goal, today) for goal in goal_service.list_goals(db)]


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
        [fs.model_dump() for fs in payload.funding_sources],
        payload.target_date,
    )
    today = date.today()
    try:
        notification_service.check_and_celebrate_goal_milestone(db, goal.id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (목표는 정상 저장됨)")
    return goal_service.to_out(db, goal, today)


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
        [fs.model_dump() for fs in payload.funding_sources],
        payload.target_date,
    )
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "재무목표를 찾을 수 없습니다.")
    today = date.today()
    try:
        notification_service.check_and_celebrate_goal_milestone(db, goal.id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (목표는 정상 저장됨)")
    return goal_service.to_out(db, goal, today)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    goal_service.delete_goal(db, goal_id)
