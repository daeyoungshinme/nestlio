"""growlio와 동일한 인증 방식: 프론트엔드(SPA)가 supabase-js로 직접 로그인해 발급받은
Supabase JWT를 Authorization 헤더로 전달하면, 백엔드는 Supabase JWKS로 서명만 검증한다.
백엔드에는 로그인 엔드포인트가 없다 (세션 쿠키/자체 로그인 로직 없음)."""

import logging
import uuid
from datetime import timedelta

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services import user_service

logger = logging.getLogger(__name__)

_LEEWAY = timedelta(seconds=5)
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.supabase_project_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


def verify_supabase_token(token: str) -> dict:
    """Supabase가 발급한 JWT를 JWKS로 검증하고 claims를 반환한다. 유효하지 않으면 ValueError."""
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            audience="authenticated",
            issuer=f"{settings.supabase_project_url}/auth/v1",
            leeway=_LEEWAY,
            options={"verify_exp": True, "verify_aud": True, "verify_iss": True},
        )
    except jwt.PyJWTError as exc:
        logger.warning(
            "token_verification_failed error_type=%s detail=%s", type(exc).__name__, str(exc)
        )
        raise ValueError("invalid token") from exc


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return authorization.removeprefix("Bearer ").strip()


def get_token_payload(authorization: str | None = Header(default=None)) -> dict:
    """DB 조회 없이 JWT claims만 필요한 엔드포인트를 위한 가벼운 의존성."""
    token = _extract_bearer_token(authorization)
    try:
        return verify_supabase_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None


def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    """원본 Bearer 토큰이 그대로 필요한 엔드포인트를 위한 의존성 — growlio 등 같은 Supabase
    프로젝트를 공유하는 자매 서비스 API를 호출할 때, 사용자의 JWT를 그대로 전달하기 위해 쓴다
    (app/services/growlio_client.py). 서명 검증까지 하므로 get_current_user와 함께 걸어도 중복 비용은
    JWKS 캐시(_jwks_client)로 크지 않다."""
    token = _extract_bearer_token(authorization)
    try:
        verify_supabase_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None
    return token


def get_current_user(
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db),
) -> User:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user_id = uuid.UUID(sub)
    user = db.get(User, user_id)
    if user is not None and user.removed_at is not None:
        # 배우자에게서 제거된 계정 - Supabase 세션 자체는 여전히 유효하므로 401이 아니라
        # 403으로 거부한다 (401이면 프론트가 refreshSession()을 성공시킨 뒤 재요청이 조용히
        # 실패해 로그아웃 처리로 이어지지 않는다). frontend/src/api/client.ts가
        # user_service.REMOVED_USER_DETAIL 문자열을 매칭해 자동 로그아웃시킨다.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=user_service.REMOVED_USER_DETAIL)
    if user is None:
        # nestlio는 자체 회원가입이 없다 - 대신 인증된(=Supabase JWT가 유효한) 요청이면
        # 로컬 users가 가구 인원 상한(MAX_HOUSEHOLD_USERS, 2명)에 도달할 때까지는 첫 요청에서
        # 바로 Supabase Auth 사용자를 로컬 User 행으로 자동 미러링한다 - growlio처럼 같은
        # Supabase 프로젝트를 공유하는 계정도 이 상한 안에서는 초대 없이 로그인만으로 등록된다.
        # 상한에 도달한 뒤에는 더 이상 새 계정이 생기지 않는다. 배우자 초대(invite_service)는
        # 여전히 쓸 수 있지만 필수 경로는 아니다 - 표시 이름을 미리 지정해 초대장을 보내는
        # 보조 수단일 뿐, 계정 생성 자체를 막는 게이트가 아니다.
        if len(user_service.list_users(db)) >= user_service.MAX_HOUSEHOLD_USERS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이미 가구 인원(2명)이 모두 등록되어 있습니다.",
            )
        email = payload.get("email", "")
        user = User(id=user_id, email=email, display_name=email.split("@")[0] if email else "user")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
