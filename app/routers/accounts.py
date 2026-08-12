from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.account import (
    AccountCreateIn,
    AccountGrowlioImportIn,
    AccountOut,
    AccountUpdateIn,
    AccountWithBalanceOut,
)
from app.schemas.savings_product import GrowlioAccountOut
from app.services import account_service
from app.services.growlio_client import GrowlioNotConfiguredError, GrowlioRequestError

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountWithBalanceOut])
def list_accounts(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return account_service.list_with_balances(db)


@router.get("/growlio-accounts", response_model=list[GrowlioAccountOut])
def list_growlio_accounts(bearer_token: str = Depends(get_bearer_token), _: User = Depends(get_current_user)):
    """계좌 가져오기 대상 선택을 위해 growlio 은행 계좌 목록을 프록시로 조회한다."""
    try:
        return account_service.list_growlio_bank_accounts(bearer_token)
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return account_service.create_account(
        db, payload.name, payload.account_type, payload.initial_balance, payload.owner_user_id
    )


@router.post("/growlio-import", response_model=list[AccountOut])
def import_growlio_accounts(
    payload: AccountGrowlioImportIn,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    current_user: User = Depends(get_current_user),
):
    """선택한 growlio 은행 계좌들을 각각 새 계좌로 일괄 가져온다 ('전체 선택' 가져오기)."""
    try:
        return account_service.import_from_growlio(db, payload.growlio_account_ids, bearer_token, current_user.id)
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    account = account_service.update_account(
        db, account_id, payload.name, payload.account_type, payload.current_balance, payload.owner_user_id
    )
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "계좌를 찾을 수 없습니다.")
    return account


@router.post("/{account_id}/sync", response_model=AccountOut)
def sync_account(
    account_id: int,
    db: Session = Depends(get_db),
    bearer_token: str = Depends(get_bearer_token),
    _: User = Depends(get_current_user),
):
    try:
        account = account_service.sync_account(db, account_id, bearer_token, now=datetime.now())
    except GrowlioNotConfiguredError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except GrowlioRequestError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except account_service.GrowlioSyncError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "계좌를 찾을 수 없습니다.")
    return account


@router.post("/{account_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate(account_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    account_service.deactivate_account(db, account_id)
