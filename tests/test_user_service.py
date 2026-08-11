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
