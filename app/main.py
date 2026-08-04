from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings as app_settings
from app.routers import (
    accounts,
    budgets,
    cashflow_plan,
    categories,
    challenges,
    dashboard,
    events,
    goals,
    invites,
    loans,
    net_worth,
    notifications,
    recurring,
    reports,
    savings_products,
    settings,
    transactions,
    users,
)
from app.scheduler.setup import start_scheduler, stop_scheduler

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Nestlio", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(categories.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(transactions.router, prefix=API_PREFIX)
app.include_router(budgets.router, prefix=API_PREFIX)
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
app.include_router(net_worth.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(challenges.router, prefix=API_PREFIX)

Path(app_settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=app_settings.upload_dir), name="media")

# growlio는 별도 nginx가 프론트엔드를 서빙하지만, nestlio는 운영 단순화를 위해
# FastAPI가 빌드된 SPA(frontend/dist, `npm run build` 산출물)를 직접 서빙한다.
# /api/v1/* 라우터가 모두 등록된 "이후"에 마운트해야 이 catch-all이 API 경로를 가로채지 않는다.
# `frontend/dist`가 없으면(빌드 전, 또는 API만 쓰는 개발 환경) 조용히 건너뛴다.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
