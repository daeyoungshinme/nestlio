"""app/middleware.py — 보안 헤더·정적 자산 캐시·GZip/CORS 등록 순서. 실제 앱 대신 작은 앱에 같은 미들웨어를
등록해 frontend/dist 유무(빌드 여부)와 무관하게 본다."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.testclient import TestClient

from app.config import settings
from app.middleware import register_middleware


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    @app.get("/assets/index-abc123.js")
    def asset():
        return PlainTextResponse("console.log(1)")

    @app.get("/assets/missing.js")
    def missing_asset():
        raise HTTPException(status_code=404)

    @app.get("/api/v1/ping")
    def ping():
        return {"ok": True}

    @app.get("/api/v1/big")
    def big():
        return PlainTextResponse("x" * 2000)

    register_middleware(app)
    return TestClient(app)


def test_security_headers_on_every_response(client):
    headers = client.get("/api/v1/ping").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert headers["Strict-Transport-Security"].startswith("max-age=")


def test_security_headers_include_clickjacking_and_object_csp(client):
    csp = client.get("/api/v1/ping").headers["Content-Security-Policy"]
    for directive in ("frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"):
        assert directive in csp


def test_hashed_assets_get_long_immutable_cache(client):
    assert client.get("/assets/index-abc123.js").headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert "Cache-Control" not in client.get("/api/v1/ping").headers


def test_missing_asset_is_not_cached_as_immutable(client):
    # 배포 직후 옛 index.html이 새 파일명을 찾다 404를 받으면, 그 404가 1년 캐시되면 안 된다.
    response = client.get("/assets/missing.js")
    assert response.status_code == 404
    assert "immutable" not in response.headers.get("Cache-Control", "")


def test_gzip_compresses_large_bodies(client):
    response = client.get("/api/v1/big", headers={"Accept-Encoding": "gzip"})
    assert response.headers["Content-Encoding"] == "gzip"
    # 압축 뒤에도 보안 헤더는 붙어 있다(GZip이 가장 안쪽).
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_cors_preflight_allows_configured_origin(client):
    if not settings.cors_origins:
        pytest.skip("CORS_ORIGINS가 비어 있다")
    origin = settings.cors_origins[0]
    response = client.options(
        "/api/v1/ping", headers={"Origin": origin, "Access-Control-Request-Method": "GET"}
    )
    assert response.headers["access-control-allow-origin"] == origin
