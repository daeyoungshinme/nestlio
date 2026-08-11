import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserOut, UserUpdateIn
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return user_service.update_display_name(db, current_user, payload.display_name)


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return user_service.list_users(db)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """부부 앱은 사용자 간 프라이버시 경계가 없으므로(GET /users가 이미 두 사용자 정보를
    그대로 반환), 배우자의 표시 이름도 이 엔드포인트로 바꿀 수 있다."""
    user = user_service.get_user(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    return user_service.update_display_name(db, user, payload.display_name)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """가구 구성원 중 한쪽이 상대(배우자)를 제거한다 - 하드 삭제가 아니라 소프트 삭제이므로
    거래내역 등 기존 데이터는 그대로 남는다 (app/services/user_service.py::remove_user 참고).
    본인은 이 엔드포인트로 제거할 수 없다."""
    user = user_service.get_user(db, user_id)
    if user is None or user.removed_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    try:
        user_service.remove_user(db, target=user, requested_by=current_user)
    except user_service.CannotRemoveSelfError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
