import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_token_payload
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
    invite = invite_service.create_invite(db, current_user.id, payload.email)
    return invite_service.to_out(invite)


@router.get("", response_model=list[InviteOut])
def list_invites(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [invite_service.to_out(invite) for invite in invite_service.list_invites(db)]


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(invite_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    invite_service.cancel_invite(db, invite_id)


@router.get("/token/{token}", response_model=InviteOut)
def validate_invite(token: str, db: Session = Depends(get_db)):
    """인증 없이 접근하는 공개 엔드포인트 — 초대 가입 페이지에서 이메일 프리필/유효성 확인용."""
    invite = invite_service.get_invite_by_token(db, token)
    return invite_service.to_out(invite)


@router.post("/token/{token}/accept", response_model=UserOut)
def accept_invite(
    token: str,
    payload: InviteAcceptIn,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(get_token_payload),
):
    """Supabase JWT는 필요하지만(서명 검증만) 로컬 User 미러링은 거치지 않는 엔드포인트 —
    프론트엔드가 supabase.auth.signUp(및 필요 시 이메일 확인) 이후, 세션이 확립된 시점에 호출한다.
    user_id/email은 클라이언트가 아니라 검증된 JWT에서만 가져온다."""
    try:
        user_id = uuid.UUID(token_payload.get("sub") or "")
    except ValueError:
        # sub 누락·비UUID — 서명은 맞아도 이 앱이 쓸 수 없는 토큰이다(500이 아니라 401).
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from None
    user = invite_service.accept_invite(
        db, token, user_id, token_payload.get("email", ""), payload.display_name
    )
    return user
