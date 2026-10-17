from fastapi import FastAPI

from app.exception_handlers import register_exception_handlers
from app.middleware import register_middleware
from app.routers import (
    accounts,
    annual_plan,
    cashflow_plan,
    categories,
    dashboard,
    events,
    goals,
    insurance,
    internal_jobs,
    invites,
    loans,
    media,
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
from app.spa import mount_spa

API_PREFIX = "/api/v1"
# 등록 순서 = OpenAPI 경로 순서(api.generated.ts) — 바꾸면 생성 타입 파일이 통째로 재배열된다.
API_ROUTERS = (
    users.router,
    categories.router,
    dashboard.router,
    transactions.router,
    recurring.router,
    events.router,
    accounts.router,
    reports.router,
    settings.router,
    cashflow_plan.router,
    goals.router,
    invites.router,
    savings_products.router,
    insurance.router,
    loans.router,
    real_estate.router,
    net_worth.router,
    notifications.router,
    annual_plan.router,
)

app = FastAPI(title="Nestlio")
register_middleware(app)
for api_router in API_ROUTERS:
    app.include_router(api_router, prefix=API_PREFIX)
app.include_router(internal_jobs.router)
register_exception_handlers(app)
app.include_router(media.router)
# SPA catch-all은 모든 라우터 "이후"에 — 먼저 등록하면 API 경로를 가로챈다.
mount_spa(app)
