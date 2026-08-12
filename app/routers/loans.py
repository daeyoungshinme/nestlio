from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.loan import LoanCreateIn, LoanOut, LoanUpdateIn
from app.services import loan_service

router = APIRouter(prefix="/loans", tags=["loans"])


@router.get("", response_model=list[LoanOut])
def list_loans(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return loan_service.list_loans(db)


@router.post("", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
def create_loan(payload: LoanCreateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return loan_service.create_loan(
        db,
        payload.name,
        payload.balance,
        payload.monthly_payment,
        payload.origination_year_month,
        payload.term_months,
        payload.interest_rate,
        payload.repayment_method,
        payload.owner_user_id,
    )


@router.put("/{loan_id}", response_model=LoanOut)
def update_loan(
    loan_id: int, payload: LoanUpdateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    loan = loan_service.update_loan(
        db,
        loan_id,
        payload.name,
        payload.balance,
        payload.monthly_payment,
        payload.origination_year_month,
        payload.term_months,
        payload.interest_rate,
        payload.repayment_method,
        payload.owner_user_id,
    )
    if loan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "대출을 찾을 수 없습니다.")
    return loan


@router.post("/{loan_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_loan(loan_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    loan_service.deactivate_loan(db, loan_id)
