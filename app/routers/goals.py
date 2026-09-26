import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.financial_goal import (
    FinancialGoalCreateIn,
    FinancialGoalOut,
    FinancialGoalUpdateIn,
    GoalCheerIn,
    GoalCheerOut,
    GoalMonthlyTargetAchievedIn,
    GrowlioGoalInsightOut,
    GrowlioGoalSettingsOut,
)
from app.services import goal_progress_service, goal_service, notification_inbox_service, notification_service
from app.utils.dates import now_kst, today_kst

router = APIRouter(prefix="/financial-goals", tags=["financial-goals"])
logger = logging.getLogger(__name__)


@router.get("/growlio-goal", response_model=GrowlioGoalSettingsOut)
def get_growlio_goal(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """재무목표 신규 작성 폼을 미리 채우기 위해 growlio 투자목표 설정값을 프록시로 조회한다."""
    return goal_service.fetch_growlio_goal_settings(bearer_token)


@router.get("", response_model=list[FinancialGoalOut])
def list_goals(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = today_kst()
    return [goal_progress_service.to_out(db, goal, today) for goal in goal_service.list_goals(db)]


@router.post("", response_model=FinancialGoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: FinancialGoalCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = now_kst()
    today = now.date()
    try:
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
            kind=payload.kind,
            description=payload.description,
            start_date=payload.start_date,
            created_by_id=current_user.id if payload.kind == "challenge" else None,
            monthly_targets=[mt.model_dump() for mt in payload.monthly_targets] if payload.monthly_targets else None,
            now=now,
            expected_annual_return_pct=payload.expected_annual_return_pct,
        )
    except goal_service.DuplicateFundingSourceProductError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    try:
        notification_service.check_and_celebrate_goal_milestone(db, goal.id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (목표는 정상 저장됨)")
    return goal_progress_service.to_out(db, goal, today)


@router.put("/{goal_id}", response_model=FinancialGoalOut)
def update_goal(
    goal_id: int,
    payload: FinancialGoalUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = now_kst()
    today = now.date()
    try:
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
            description=payload.description,
            start_date=payload.start_date,
            monthly_targets=[mt.model_dump() for mt in payload.monthly_targets] if payload.monthly_targets else None,
            now=now,
            expected_annual_return_pct=payload.expected_annual_return_pct,
        )
    except goal_service.DuplicateFundingSourceProductError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "재무목표를 찾을 수 없습니다.")
    try:
        notification_service.check_and_celebrate_goal_milestone(db, goal.id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (목표는 정상 저장됨)")
    return goal_progress_service.to_out(db, goal, today)


@router.patch("/{goal_id}/monthly-targets/{year_month}", response_model=FinancialGoalOut)
def update_monthly_target(
    goal_id: int,
    year_month: str,
    payload: GoalMonthlyTargetAchievedIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        goal = goal_service.update_monthly_target_achieved(db, goal_id, year_month, payload.achieved_amount)
    except goal_service.MonthlyTargetNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "재무목표를 찾을 수 없습니다.")
    today = today_kst()
    try:
        notification_service.check_and_celebrate_goal_milestone(db, goal.id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (월별 목표는 정상 저장됨)")
    return goal_progress_service.to_out(db, goal, today)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not goal_service.delete_goal(db, goal_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "목표를 찾을 수 없습니다.")


@router.post("/{goal_id}/cheer", response_model=GoalCheerOut, status_code=status.HTTP_201_CREATED)
def cheer_goal(
    goal_id: int,
    payload: GoalCheerIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """배우자에게 목표 응원을 보낸다(알림함에 남는다) — 서로 동기부여."""
    goal = goal_service.get_goal(db, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="목표를 찾을 수 없습니다.")
    try:
        notification_id = notification_inbox_service.send_goal_cheer(
            db, current_user.id, current_user.display_name, goal.id, goal.name, payload.emoji, payload.message
        )
    except notification_inbox_service.InvalidReactionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    return {"notification_id": notification_id}


@router.get("/{goal_id}/growlio-insight", response_model=GrowlioGoalInsightOut)
def get_growlio_insight(
    goal_id: int,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    """목표 상세의 "투자 수익을 반영하면?" — growlio 실적 수익률과 이 목표의 필요 수익률·프리셋별 필요 적립액."""
    goal = goal_service.get_goal(db, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="목표를 찾을 수 없습니다.")
    return goal_service.fetch_growlio_insight(db, goal, bearer_token, today_kst())
