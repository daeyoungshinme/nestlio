import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models.invite import Invite
from app.models.user import User
from app.services import gmail_service, user_service
from app.services.google_auth import is_connected

INVITE_EXPIRY_DAYS = 7
MAX_HOUSEHOLD_USERS = 2


class InviteError(Exception):
    pass


class HouseholdFullError(InviteError):
    pass


class InviteNotFoundError(InviteError):
    pass


class InviteExpiredError(InviteError):
    pass


class InviteAlreadyAcceptedError(InviteError):
    pass


def _accept_url(token: str) -> str:
    return f"{settings.app_base_url}/invite/accept?token={token}"


def to_out(invite: Invite) -> dict:
    return {
        "id": invite.id,
        "email": invite.email,
        "invited_by_id": invite.invited_by_id,
        "created_at": invite.created_at,
        "expires_at": invite.expires_at,
        "accepted_at": invite.accepted_at,
        "accept_url": _accept_url(invite.token),
    }


def _send_invite_email(invite: Invite) -> None:
    if not is_connected():
        return
    body = (
        "nestlio에 배우자로 초대되었습니다.\n\n"
        f"아래 링크에서 계정을 만들어주세요 (7일 이내 유효):\n{_accept_url(invite.token)}"
    )
    gmail_service.send_email("[Nestlio] 배우자 초대", body, to=invite.email)


def create_invite(db: Session, invited_by_id: uuid.UUID, email: str, now: datetime | None = None) -> Invite:
    now = now or datetime.now()
    if len(user_service.list_users(db)) >= MAX_HOUSEHOLD_USERS:
        raise HouseholdFullError("이미 두 명의 사용자가 등록되어 있습니다.")

    existing = db.query(Invite).filter(Invite.email == email, Invite.accepted_at.is_(None)).first()
    if existing is not None:
        existing.token = secrets.token_urlsafe(32)
        existing.expires_at = now + timedelta(days=INVITE_EXPIRY_DAYS)
        existing.invited_by_id = invited_by_id
        invite = existing
    else:
        invite = Invite(
            email=email,
            token=secrets.token_urlsafe(32),
            invited_by_id=invited_by_id,
            expires_at=now + timedelta(days=INVITE_EXPIRY_DAYS),
        )
        db.add(invite)
    db.commit()
    db.refresh(invite)

    _send_invite_email(invite)
    return invite


def list_invites(db: Session) -> list[Invite]:
    return db.query(Invite).order_by(Invite.created_at.desc()).all()


def cancel_invite(db: Session, invite_id: uuid.UUID) -> None:
    invite = db.get(Invite, invite_id)
    if invite is None:
        raise InviteNotFoundError("초대를 찾을 수 없습니다.")
    if invite.accepted_at is not None:
        raise InviteAlreadyAcceptedError("이미 수락된 초대는 취소할 수 없습니다.")
    db.delete(invite)
    db.commit()


def get_invite_by_token(db: Session, token: str, now: datetime | None = None) -> Invite:
    now = now or datetime.now()
    invite = db.query(Invite).filter(Invite.token == token).first()
    if invite is None:
        raise InviteNotFoundError("초대를 찾을 수 없습니다.")
    if invite.accepted_at is not None:
        raise InviteAlreadyAcceptedError("이미 수락된 초대입니다.")
    if invite.expires_at < now:
        raise InviteExpiredError("초대가 만료되었습니다.")
    return invite


def accept_invite(
    db: Session, token: str, user_id: uuid.UUID, display_name: str, now: datetime | None = None
) -> User:
    now = now or datetime.now()
    invite = get_invite_by_token(db, token, now=now)

    user = db.get(User, user_id)
    if user is None:
        user = User(id=user_id, email=invite.email, display_name=display_name)
        db.add(user)
    else:
        user.display_name = display_name

    invite.accepted_at = now
    db.commit()
    db.refresh(user)
    return user
