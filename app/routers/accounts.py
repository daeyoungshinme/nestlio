from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.account import AccountCreateIn, AccountOut, AccountWithBalanceOut
from app.services import account_service

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountWithBalanceOut])
def list_accounts(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return account_service.list_with_balances(db)


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return account_service.create_account(db, payload.name, payload.account_type, payload.initial_balance)


@router.post("/{account_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate(account_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    account_service.deactivate_account(db, account_id)
