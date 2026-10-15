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


class AuthUnavailableError(Exception):
    """JWKS(서명 공개키)를 못 받아와 토큰을 검증할 수 없는 상태 — 토큰이 잘못된 게 아니라 Supabase
    쪽 장애다. 401로 응답하면 프론트가 세션 갱신 → 재요청 → 로그아웃으로 이어지므로 503으로 구분한다."""


def verify_supabase_token(token: str) -> dict:
    """Supabase가 발급한 JWT를 JWKS로 검증하고 claims를 반환한다. 유효하지 않으면 ValueError."""
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            audience="authenticated",
            # 같은 JWKS를 쓰는 다른 발급 경로의 토큰을 받지 않도록 발급자도 고정한다(Supabase Auth = <project>/auth/v1).
            issuer=f"{settings.supabase_project_url.rstrip('/')}/auth/v1",
            leeway=_LEEWAY,
            options={"verify_exp": True, "verify_aud": True, "verify_iss": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("expired token") from exc
    except jwt.PyJWKClientConnectionError as exc:
        logger.warning("jwks_unreachable detail=%s", str(exc))
        raise AuthUnavailableError from exc
    except jwt.PyJWTError as exc:
        logger.warning(
            "token_verification_failed error_type=%s detail=%s", type(exc).__name__, str(exc)
        )
        raise ValueError("invalid token") from exc


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return authorization.removeprefix("Bearer ").strip()


def _verify_or_http_error(token: str) -> dict:
    try:
        return verify_supabase_token(token)
    except ValueError as exc:
        raise _token_error(exc) from None
    except AuthUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from None


def _token_error(exc: ValueError) -> HTTPException:
    # verify_supabase_token이 raise ValueError("expired token") / ValueError("invalid token")로
    # 구분해서 던지므로, 만료는 별도 문구로 응답한다 - 만료는 재로그인하면 그만인 정상적인 상황이라
    # 클라이언트/디버깅 양쪽에서 "코드가 깨진 Invalid token"과 구분할 수 있어야 한다.
    detail = "Token expired" if str(exc) == "expired token" else "Invalid token"
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def get_token_payload(authorization: str | None = Header(default=None)) -> dict:
    """DB 조회 없이 JWT claims만 필요한 엔드포인트를 위한 가벼운 의존성."""
    return _verify_or_http_error(_extract_bearer_token(authorization))


def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    """원본 Bearer 토큰이 그대로 필요한 엔드포인트를 위한 의존성 — growlio 등 같은 Supabase
    프로젝트를 공유하는 자매 서비스 API를 호출할 때, 사용자의 JWT를 그대로 전달하기 위해 쓴다
    (app/services/growlio_client.py). 서명 검증까지 하므로 get_current_user와 함께 걸어도 중복 비용은
    JWKS 캐시(_jwks_client)로 크지 않다."""
    token = _extract_bearer_token(authorization)
    _verify_or_http_error(token)
    return token


def get_current_user(
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db),
) -> User:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    try:
        user_id = uuid.UUID(sub)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc
    user = db.get(User, user_id)
    if user is not None and user.removed_at is not None:
        # 배우자에게서 제거된 계정 - Supabase 세션 자체는 여전히 유효하므로 401이 아니라
        # 403으로 거부한다 (401이면 프론트가 refreshSession()을 성공시킨 뒤 재요청이 조용히
        # 실패해 로그아웃 처리로 이어지지 않는다). frontend/src/api/client.ts가
        # user_service.REMOVED_USER_DETAIL 문자열을 매칭해 자동 로그아웃시킨다.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=user_service.REMOVED_USER_DETAIL)
    if user is None:
        # 자동 미러링(가구 정원까지) — 정원이 차면 HouseholdCapacityError가 전역 핸들러에서 403이 된다.
        user = user_service.ensure_mirrored_user(db, user_id, payload.get("email", ""))
    return user
