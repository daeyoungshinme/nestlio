"""growlio 등 같은 Supabase 프로젝트를 공유하는 자매 서비스가 사용자의 살아있는 JWT를 그대로
전달해 호출하는 읽기전용 엔드포인트. growlio의 app/api/v1/external.py와 대칭되는 nestlio 쪽
엔드포인트 — nestlio는 지금까지 growlio를 호출만 했고(app/services/growlio_client.py) 자신의
외부 API를 노출한 적은 없었다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.annual_savings_goal import AnnualSavingsGoalExternalOut
from app.services import annual_savings_goal_service

router = APIRouter(prefix="/external", tags=["external"])


@router.get("/annual-savings-goals", response_model=list[AnnualSavingsGoalExternalOut])
def list_annual_savings_goals(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return annual_savings_goal_service.list_goals(db)
