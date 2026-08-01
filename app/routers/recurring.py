from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.recurring import RecurringCreateIn, RecurringListOut, RecurringOut, RecurringUpdateIn, RunNowResultOut
from app.services import recurring_service

# 프론트엔드 관리 화면은 없다 (의도적으로 API 전용) — 자동 생성은
# app/scheduler/jobs.py의 daily_due_date_check가 recurring_service를 직접 호출해서 처리하며,
# 이 라우터는 새 규칙 등록/수정/수동 실행이 필요할 때 API를 직접 호출하기 위한 용도다.
router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=RecurringListOut)
def list_recurring(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {
        "items": recurring_service.list_recurring(db),
        "upcoming": recurring_service.upcoming(db, within_days=14),
    }


@router.post("", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    payload: RecurringCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return recurring_service.create_recurring(
        db,
        name=payload.name,
        category_id=payload.category_id,
        amount=payload.amount,
        frequency=payload.frequency,
        start_date=payload.start_date,
        created_by=current_user.id,
        end_date=payload.end_date,
        reminder_days_before=payload.reminder_days_before,
    )


@router.put("/{recurring_id}", response_model=RecurringOut)
def update_recurring(
    recurring_id: int,
    payload: RecurringUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    fields = payload.model_dump(exclude_unset=True)
    if "start_date" in fields:
        fields["day_of_month"] = fields["start_date"].day
    recurring = recurring_service.update_recurring(db, recurring_id, **fields)
    if recurring is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "고정지출을 찾을 수 없습니다.")
    return recurring


@router.post("/run-now", response_model=RunNowResultOut)
def run_now(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """수동으로 고정지출 마감 체크를 실행한다 (스케줄러의 daily_due_date_check와 동일 로직)."""
    created = recurring_service.generate_due_transactions(db)
    return {"created_count": len(created)}


@router.post("/{recurring_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate(recurring_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    recurring_service.deactivate_recurring(db, recurring_id)
