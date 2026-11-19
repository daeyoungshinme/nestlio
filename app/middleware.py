from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings


async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/assets/"):
        # Vite 빌드 산출물은 콘텐츠 해시 파일명이라 장기 캐시가 안전하다.
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
    )
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


def register_middleware(app: FastAPI) -> None:
    # Starlette `add_middleware`는 맨 앞에 끼워 넣으므로 **나중에 등록한 것이 가장 바깥**이다. GZip을 먼저 등록해
    # 가장 안쪽에 두면 앱 응답 바디를 압축하고, 바깥의 CORS·보안 헤더 미들웨어는 압축된 응답에 헤더만 붙인다.
    app.add_middleware(GZipMiddleware, minimum_size=500)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(add_security_headers)
