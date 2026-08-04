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
            leeway=_LEEWAY,
            options={"verify_exp": True, "verify_aud": True},
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
    if user is None:
        # nestlio는 자체 회원가입이 없다 (spouse1/spouse2 시드 고정) - 첫 인증된 요청에서
        # Supabase Auth 사용자를 로컬 User 행으로 미러링한다 (기존 auth_service의
        # authenticate_user가 로그인 시점에 하던 것과 동일한 로직, 시점만 다름).
        email = payload.get("email", "")
        user = User(id=user_id, email=email, display_name=email.split("@")[0] if email else "user")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
