import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.invite import InviteAcceptIn, InviteCreateIn, InviteOut
from app.schemas.user import UserOut
from app.services import invite_service

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        invite = invite_service.create_invite(db, current_user.id, payload.email)
    except invite_service.HouseholdFullError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return invite_service.to_out(invite)


@router.get("", response_model=list[InviteOut])
def list_invites(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [invite_service.to_out(invite) for invite in invite_service.list_invites(db)]


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(invite_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        invite_service.cancel_invite(db, invite_id)
    except invite_service.InviteNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    except invite_service.InviteAlreadyAcceptedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


@router.get("/token/{token}", response_model=InviteOut)
def validate_invite(token: str, db: Session = Depends(get_db)):
    """인증 없이 접근하는 공개 엔드포인트 — 초대 가입 페이지에서 이메일 프리필/유효성 확인용."""
    try:
        invite = invite_service.get_invite_by_token(db, token)
    except invite_service.InviteNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    except (invite_service.InviteExpiredError, invite_service.InviteAlreadyAcceptedError) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return invite_service.to_out(invite)


@router.post("/token/{token}/accept", response_model=UserOut)
def accept_invite(token: str, payload: InviteAcceptIn, db: Session = Depends(get_db)):
    """인증 없이 접근하는 공개 엔드포인트 — 프론트엔드가 supabase.auth.signUp 직후 호출한다."""
    try:
        user = invite_service.accept_invite(db, token, payload.user_id, payload.display_name)
    except invite_service.InviteNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    except (invite_service.InviteExpiredError, invite_service.InviteAlreadyAcceptedError) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return user
