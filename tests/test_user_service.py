from datetime import datetime

import pytest

from app.models.user import User
from app.services import user_service
from app.services.user_service import CannotRemoveSelfError

NOW = datetime(2026, 8, 7, 12, 0, 0)


def test_list_users_excludes_removed(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)

    user_service.remove_user(db, target=spouse, requested_by=user, now=NOW)

    emails = {u.email for u in user_service.list_users(db)}
    assert emails == {user.email}


def test_remove_user_sets_removed_at_and_removed_by(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)

    result = user_service.remove_user(db, target=spouse, requested_by=user, now=NOW)

    assert result.removed_at == NOW
    assert result.removed_by_id == user.id


def test_remove_user_rejects_self_removal(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    with pytest.raises(CannotRemoveSelfError):
        user_service.remove_user(db, target=user, requested_by=user, now=NOW)

    assert user.removed_at is None


def test_mirror_supabase_user_returns_winner_on_concurrent_first_login(db_session):
    """첫 로그인 직후 병렬 요청이 동시에 INSERT하면 늦은 쪽은 PK 충돌 — 500 대신 먼저 생긴 행을 돌려준다."""
    import uuid

    from sqlalchemy.orm import sessionmaker

    user_id = uuid.uuid4()
    other_request = sessionmaker(bind=db_session.get_bind())()
    user_service.mirror_supabase_user(other_request, user_id, "first@example.com")
    other_request.close()

    user = user_service.mirror_supabase_user(db_session, user_id, "first@example.com")

    assert user.id == user_id
    assert db_session.query(User).count() == 1


def test_ensure_mirrored_user_creates_until_household_full(db_session):
    import uuid

    first = user_service.ensure_mirrored_user(db_session, uuid.uuid4(), "a@example.com")
    second = user_service.ensure_mirrored_user(db_session, uuid.uuid4(), "b@example.com")
    assert (first.display_name, second.display_name) == ("a", "b")

    with pytest.raises(user_service.HouseholdCapacityError):
        user_service.ensure_mirrored_user(db_session, uuid.uuid4(), "c@example.com")
