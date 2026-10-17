from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.insurance import InsurancePolicyIn, InsurancePolicyOut
from app.services import insurance_service

router = APIRouter(prefix="/insurance-policies", tags=["insurance"])

_NOT_FOUND = "보험 계약을 찾을 수 없습니다."


@router.get("", response_model=list[InsurancePolicyOut])
def list_policies(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return insurance_service.list_policies(db)


@router.post("", response_model=InsurancePolicyOut, status_code=status.HTTP_201_CREATED)
def create_policy(payload: InsurancePolicyIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return insurance_service.create_policy(db, payload.to_fields())


@router.put("/{policy_id}", response_model=InsurancePolicyOut)
def update_policy(
    policy_id: int, payload: InsurancePolicyIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    policy = insurance_service.update_policy(db, policy_id, payload.to_fields())
    if policy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _NOT_FOUND)
    return policy


@router.post("/{policy_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_policy(policy_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not insurance_service.deactivate_policy(db, policy_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, _NOT_FOUND)
