from datetime import datetime

from sqlalchemy.orm import Session

from app.models.user import User

# 부부 전용 앱이라 로컬 users는 최대 2명으로 제한된다 (app/dependencies.py의 자동 미러링,
# app/services/invite_service.py의 초대 발송/수락 둘 다 이 상한을 공유한다).
MAX_HOUSEHOLD_USERS = 2

# app/dependencies.py::get_current_user가 제거된 계정으로 들어온 요청을 403으로 거부할 때
# 쓰는 detail 문자열. frontend/src/api/client.ts가 이 문자열을 정확히 매칭해 자동 로그아웃
# 처리를 하므로, 문구를 바꾸면 프론트도 함께 바꿔야 한다.
REMOVED_USER_DETAIL = "가구에서 제외된 계정입니다. 다시 로그인해 주세요."


class UserError(Exception):
    pass


class CannotRemoveSelfError(UserError):
    pass


def list_users(db: Session) -> list[User]:
    return db.query(User).filter(User.removed_at.is_(None)).order_by(User.display_name).all()


def update_display_name(db: Session, user: User, display_name: str) -> User:
    user.display_name = display_name
    db.commit()
    db.refresh(user)
    return user


def remove_user(db: Session, target: User, requested_by: User, now: datetime | None = None) -> User:
    """target을 소프트 삭제한다 - 거래내역 등 target.id를 참조하는 기존 데이터는 그대로 두고
    removed_at만 채운다 (하드 삭제는 8개 테이블의 FK 위반을 일으킨다). list_users()가 이후
    target을 제외하므로 가구 정원이 다시 열려 새 계정이 그 자리를 채울 수 있다."""
    now = now or datetime.now()
    if target.id == requested_by.id:
        raise CannotRemoveSelfError("본인 계정은 이 방법으로 제거할 수 없습니다.")
    target.removed_at = now
    target.removed_by_id = requested_by.id
    db.commit()
    db.refresh(target)
    return target
