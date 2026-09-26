import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import String, create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.models  # noqa: F401 ensures all models are registered on Base.metadata
from app.database import Base, get_db
from app.dependencies import get_bearer_token, get_current_user, get_token_payload
from app.main import app as fastapi_app
from app.models.category import Category
from app.models.user import User


def _enforce_string_lengths(mapper, connection, target):
    """SQLite는 VARCHAR(n) 길이를 강제하지 않아 운영 Postgres에서만 터지는 길이 초과(예: String(20)에
    26자 ISO datetime)가 테스트를 통과해 버린다 — flush 직전에 String(n) 컬럼 값 길이를 대신 검사한다."""
    for attr in mapper.column_attrs:
        for column in attr.columns:
            length = getattr(column.type, "length", None)
            if not isinstance(column.type, String) or length is None:
                continue
            value = getattr(target, attr.key, None)
            if isinstance(value, str) and len(value) > length:
                raise AssertionError(
                    f"{mapper.class_.__name__}.{attr.key}: {len(value)}자 > String({length}) — Postgres에서 실패한다"
                )


event.listen(Base, "before_insert", _enforce_string_lengths, propagate=True)
event.listen(Base, "before_update", _enforce_string_lengths, propagate=True)


@pytest.fixture()
def db_session():
    # SQLite has no real schema support - translate the "household" schema (used
    # against the shared Supabase Postgres) to the default schema for tests.
    # StaticPool is required (not just check_same_thread=False): FastAPI's TestClient
    # runs sync route handlers in worker threads, and SQLite's default pool for
    # ":memory:" hands each thread its own separate (table-less) connection otherwise.
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    ).execution_options(schema_translate_map={"household": None})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _google_auth_test_db(monkeypatch, db_session):
    """google_auth.py opens its own SessionLocal() rather than using the request-scoped
    get_db() override (see app/services/CLAUDE.md's documented exception for it) - left
    unpatched, is_connected()/get_credentials() would hit the real DATABASE_URL (the
    production Supabase Postgres shared with growlio in local dev) on every call, instead
    of this test's isolated in-memory DB. Route it at the same engine db_session uses."""
    test_session_factory = sessionmaker(bind=db_session.get_bind())
    monkeypatch.setattr("app.services.google_auth.SessionLocal", test_session_factory)
    # 스케줄러 잡(app/scheduler/jobs.py)도 같은 이유로 자체 SessionLocal()을 연다.
    monkeypatch.setattr("app.scheduler.jobs.SessionLocal", test_session_factory)
    # net_worth_service.refresh_stale_growlio_links(GET /net-worth·/dashboard/bootstrap의 백그라운드
    # 태스크)처럼 함수 안에서 `from app.database import SessionLocal`로 늦게 import하는 곳은 모듈 속성
    # 자체를 바꿔야 잡힌다 — TestClient가 백그라운드 태스크까지 실행하므로 빠지면 운영 DB에 붙는다.
    monkeypatch.setattr("app.database.SessionLocal", test_session_factory)


@pytest.fixture()
def seeded_db(db_session):
    user = User(email="spouse1@example.com", display_name="Spouse 1")
    db_session.add(user)
    food = Category(name="식비", type="variable", color="#14b8a6", sort_order=0)
    rent = Category(name="주거비", type="fixed", color="#6366f1", sort_order=0)
    events = Category(name="경조사비", type="irregular", color="#e11d48", sort_order=0)
    salary = Category(name="급여", kind="income", type="fixed", color="#22c55e", sort_order=0)
    db_session.add_all([food, rent, events, salary])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(food)
    db_session.refresh(rent)
    db_session.refresh(events)
    db_session.refresh(salary)
    return {"db": db_session, "user": user, "food": food, "rent": rent, "events": events, "salary": salary}


@pytest.fixture()
def client(seeded_db):
    """TestClient for router-level tests. Auth is bypassed via dependency override
    (seeded_db's user is treated as already-authenticated) rather than minting a real
    Supabase JWT - JWKS verification itself is covered separately in test_dependencies.py."""

    def _override_get_db():
        yield seeded_db["db"]

    def _override_get_current_user():
        return seeded_db["user"]

    def _override_get_token_payload():
        return {"sub": str(seeded_db["user"].id), "email": seeded_db["user"].email}

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    fastapi_app.dependency_overrides[get_current_user] = _override_get_current_user
    fastapi_app.dependency_overrides[get_token_payload] = _override_get_token_payload
    fastapi_app.dependency_overrides[get_bearer_token] = lambda: "test-bearer-token"
    try:
        yield TestClient(fastapi_app)
    finally:
        fastapi_app.dependency_overrides.clear()
