"""JWKS 기반 인증 의존성(app/dependencies.py) 테스트.

실제 Supabase JWKS 엔드포인트를 호출하지 않도록 verify_supabase_token을 monkeypatch한다.
라우터 테스트(tests/api/)는 get_current_user 자체를 dependency_override로 우회하므로,
이 파일이 인증 체인(헤더 파싱 -> 토큰 검증 -> 유저 조회/미러링)을 검증하는 유일한 곳이다.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app as fastapi_app


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
    """nestlio는 자체 회원가입이 없다 - users 테이블이 완전히 비어 있는 최초 부팅 상태에서만
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


def test_valid_token_for_unknown_user_rejected_when_household_not_empty(
    unauth_client, monkeypatch, seeded_db
):
    """이미 사용자가 1명 이상 있으면, 초대 없이 유효한(하지만 로컬에 없는) JWT만으로는
    가입되지 않는다 - growlio 등 같은 Supabase 프로젝트의 무관한 계정이 통과되는 것을 막는다."""
    unrelated_id = uuid.uuid4()
    monkeypatch.setattr(
        "app.dependencies.verify_supabase_token",
        lambda token: {"sub": str(unrelated_id), "email": "unrelated@example.com"},
    )
    resp = unauth_client.get("/api/v1/users/me", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 403
