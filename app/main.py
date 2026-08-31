from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings as app_settings
from app.routers import (
    accounts,
    annual_plan,
    cashflow_plan,
    categories,
    dashboard,
    events,
    goals,
    internal_jobs,
    invites,
    loans,
    net_worth,
    notifications,
    real_estate,
    recurring,
    reports,
    savings_products,
    settings,
    transactions,
    users,
)
from app.services import couple_photo_service, growlio_client

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


app = FastAPI(title="Nestlio")
# GZip을 CORS/보안 헤더보다 먼저 등록한다 - Starlette은 먼저 등록한 미들웨어가 응답을
# 가장 나중에(가장 바깥에서) 처리하므로, 이래야 최종 응답 바디가 압축된다.
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
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
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    )
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


API_PREFIX = "/api/v1"
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(categories.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(transactions.router, prefix=API_PREFIX)
app.include_router(recurring.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(accounts.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(settings.router, prefix=API_PREFIX)
app.include_router(cashflow_plan.router, prefix=API_PREFIX)
app.include_router(goals.router, prefix=API_PREFIX)
app.include_router(invites.router, prefix=API_PREFIX)
app.include_router(savings_products.router, prefix=API_PREFIX)
app.include_router(loans.router, prefix=API_PREFIX)
app.include_router(real_estate.router, prefix=API_PREFIX)
app.include_router(net_worth.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(annual_plan.router, prefix=API_PREFIX)
app.include_router(internal_jobs.router)

growlio_client.register_exception_handlers(app)


@app.get("/media/couple-photo", include_in_schema=False)
def serve_couple_photo():
    # 인증 없이 서빙 — <img src>는 Authorization 헤더를 못 보내고, 기존 StaticFiles 마운트도
    # 비인증이었으므로 동작을 그대로 유지한다.
    result = couple_photo_service.get_photo_bytes()
    if result is None:
        raise HTTPException(status_code=404)
    content, content_type = result
    return Response(content=content, media_type=content_type)

# growlio는 별도 nginx가 프론트엔드를 서빙하지만, nestlio는 운영 단순화를 위해
# FastAPI가 빌드된 SPA(frontend/dist, `npm run build` 산출물)를 직접 서빙한다.
# /api/v1/* 라우터가 모두 등록된 "이후"에 마운트해야 이 catch-all이 API 경로를 가로채지 않는다.
# `frontend/dist`가 없으면(빌드 전, 또는 API만 쓰는 개발 환경) 조용히 건너뛴다.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        frontend_root = FRONTEND_DIST.resolve()
        candidate = (frontend_root / full_path).resolve()
        if full_path and candidate.is_relative_to(frontend_root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(frontend_root / "index.html")
