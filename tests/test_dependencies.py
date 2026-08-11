"""JWKS 기반 인증 의존성(app/dependencies.py) 테스트.

실제 Supabase JWKS 엔드포인트를 호출하지 않도록 verify_supabase_token을 monkeypatch한다.
라우터 테스트(tests/api/)는 get_current_user 자체를 dependency_override로 우회하므로,
이 파일이 인증 체인(헤더 파싱 -> 토큰 검증 -> 유저 조회/미러링)을 검증하는 유일한 곳이다.
"""

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.database import get_db
from app.main import app as fastapi_app
from app.models.user import User
from app.services import user_service


@pytest.fixture()
def unauth_client(db_session):
    def _override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(fastapi_app)
    finally:
        fastapi_app.dependency_overrides.clear()


def test_no_authorization_header_returns_401(unauth_client):
    resp = unauth_client.get("/api/v1/users/me")
    assert resp.status_code == 401


def test_non_bearer_header_returns_401(unauth_client):
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401


def test_invalid_token_returns_401(unauth_client, monkeypatch):
    def _raise(token):
        raise ValueError("invalid token")

    monkeypatch.setattr("app.dependencies.verify_supabase_token", _raise)
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer bad"})
    assert resp.status_code == 401


def test_valid_token_loads_existing_user(unauth_client, monkeypatch, seeded_db):
    user = seeded_db["user"]
    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(user.id), "email": user.email},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_valid_token_for_unknown_user_creates_mirror_row_when_household_empty(
    unauth_client, monkeypatch, db_session
):
    """nestlio는 자체 회원가입이 없다 - users 테이블이 완전히 비어 있는 최초 부팅 상태에서
    첫 인증된 요청이 Supabase 사용자를 로컬 User 행으로 미러링한다."""
    new_id = uuid.uuid4()
    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(new_id), "email": "new.spouse@example.com"},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(new_id)
    assert body["display_name"] == "new.spouse"


def test_valid_token_for_unknown_user_creates_mirror_row_when_household_has_room(
    unauth_client, monkeypatch, seeded_db
):
    """가구 인원 상한(2명)에 도달하기 전이면, 초대 없이 유효한 JWT만으로도 로컬 User가
    자동 생성된다 - growlio 등 같은 Supabase 프로젝트를 쓰는 계정도 이 상한 안에서는
    초대 없이 로그인만으로 등록된다."""
    new_id = uuid.uuid4()
    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(new_id), "email": "spouse2@example.com"},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(new_id)
    assert body["display_name"] == "spouse2"


def test_valid_token_rejected_when_household_full(unauth_client, monkeypatch, seeded_db):
    """가구 인원 상한(2명)에 도달한 뒤에는, 유효한(하지만 로컬에 없는) JWT만으로는
    가입되지 않는다 - 인원 상한이 유일한 방어선이다."""
    second_user = User(email="spouse2@example.com", display_name="Spouse 2")
    seeded_db["db"].add(second_user)
    seeded_db["db"].commit()

    unrelated_id = uuid.uuid4()
    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(unrelated_id), "email": "unrelated@example.com"},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 403


def test_valid_token_for_removed_user_returns_403(unauth_client, monkeypatch, seeded_db):
    """배우자에게서 제거된(removed_at이 채워진) 계정은 Supabase 세션 자체는 여전히 유효해도
    이후 요청에서 403으로 거부된다 - 401이면 프론트의 refreshSession() 재시도가 성공해버려
    로그아웃 처리로 이어지지 않기 때문에 의도적으로 403을 쓴다."""
    user = seeded_db["user"]
    user.removed_at = datetime(2026, 8, 1)
    seeded_db["db"].commit()

    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(user.id), "email": user.email},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 403


def test_household_reopens_after_removal(unauth_client, monkeypatch, seeded_db):
    """배우자를 제거하면 list_users()가 그 유저를 세지 않으므로, 가구 정원이 다시 열려
    새 Supabase 계정이 자동 미러링으로 그 자리를 채울 수 있다."""
    second_user = User(email="spouse2@example.com", display_name="Spouse 2")
    seeded_db["db"].add(second_user)
    seeded_db["db"].commit()
    seeded_db["db"].refresh(second_user)

    user_service.remove_user(seeded_db["db"], target=second_user, requested_by=seeded_db["user"])

    new_id = uuid.uuid4()
    monkeypatch.setattr(
        dependencies,
        "verify_supabase_token",
        lambda token: {"sub": str(new_id), "email": "new.spouse@example.com"},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    assert resp.json()["id"] == str(new_id)
