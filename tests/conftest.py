import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, get_db
from app.dependencies import get_current_user, get_token_payload
import app.models  # noqa: F401 ensures all models are registered on Base.metadata
from app.main import app as fastapi_app
from app.models.category import Category
from app.models.user import User


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


@pytest.fixture()
def seeded_db(db_session):
    user = User(email="spouse1@example.com", display_name="Spouse 1")
    db_session.add(user)
    food = Category(name="식비", type="variable", color="#14b8a6", sort_order=0)
    rent = Category(name="주거비", type="fixed", color="#6366f1", sort_order=0)
    events = Category(name="경조사비", type="irregular", color="#e11d48", sort_order=0)
    db_session.add_all([food, rent, events])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(food)
    db_session.refresh(rent)
    db_session.refresh(events)
    return {"db": db_session, "user": user, "food": food, "rent": rent, "events": events}


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
    try:
        yield TestClient(fastapi_app)
    finally:
        fastapi_app.dependency_overrides.clear()
