from app.models.user import User
from app.services import notify_recipients_service


def _second_user(db) -> User:
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)
    return spouse


def test_get_recipients_defaults_to_signup_email_when_unset(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    assert notify_recipients_service.get_recipients(db) == [user.email]


def test_get_recipients_includes_second_user_once_joined(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    spouse = _second_user(db)

    assert notify_recipients_service.get_recipients(db) == [user.email, spouse.email]


def test_set_recipients_overrides_and_persists(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    result = notify_recipients_service.set_recipients(db, ["a@example.com", "b@example.com"], user.id)

    assert result == ["a@example.com", "b@example.com"]
    assert notify_recipients_service.get_recipients(db) == ["a@example.com", "b@example.com"]


def test_set_recipients_override_does_not_auto_merge_new_spouse_email(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    notify_recipients_service.set_recipients(db, ["only-this@example.com"], user.id)
    _second_user(db)

    assert notify_recipients_service.get_recipients(db) == ["only-this@example.com"]
