import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from app.services import invite_service
from app.services.invite_service import (
    HouseholdFullError,
    InviteAlreadyAcceptedError,
    InviteEmailMismatchError,
    InviteExpiredError,
    InviteNotFoundError,
)

NOW = datetime(2026, 8, 3, 12, 0, 0)


def test_create_invite_creates_pending_invite(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    assert invite.email == "spouse2@example.com"
    assert invite.invited_by_id == user.id
    assert invite.accepted_at is None
    assert invite.expires_at == NOW + timedelta(days=invite_service.INVITE_EXPIRY_DAYS)
    assert len(invite.token) > 20


@patch("app.services.invite_service.gmail_service.send_email")
def test_create_invite_sends_email_when_connected(mock_send_email, seeded_db, gmail_connected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    mock_send_email.assert_called_once()
    _, kwargs = mock_send_email.call_args
    assert kwargs["to"] == "spouse2@example.com"
    assert invite.email_sent is True


@patch("app.services.invite_service.gmail_service.send_email")
def test_create_invite_skips_email_when_not_connected(mock_send_email, seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    mock_send_email.assert_not_called()
    assert invite.email_sent is False


@patch("app.services.invite_service.gmail_service.send_email", side_effect=Exception("boom"))
def test_create_invite_survives_email_send_failure(mock_send_email, seeded_db, gmail_connected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    mock_send_email.assert_called_once()
    assert invite.email_sent is False
    assert invite_service.list_invites(db)[0].id == invite.id


def test_create_invite_fails_when_household_full(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite_service.accept_invite(
        db,
        invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW).token,
        uuid.uuid4(),
        "spouse2@example.com",
        "Spouse 2",
        now=NOW,
    )

    with pytest.raises(HouseholdFullError):
        invite_service.create_invite(db, user.id, "third@example.com", now=NOW)


def test_create_invite_reuses_pending_invite_for_same_email(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    first = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)
    first_id, first_token = first.id, first.token
    second = invite_service.create_invite(
        db, user.id, "spouse2@example.com", now=NOW + timedelta(days=1)
    )

    assert first_id == second.id
    assert first_token != second.token
    assert len(invite_service.list_invites(db)) == 1


def test_get_invite_by_token_not_found(seeded_db, gmail_disconnected):
    with pytest.raises(InviteNotFoundError):
        invite_service.get_invite_by_token(seeded_db["db"], "nonexistent-token", now=NOW)


def test_get_invite_by_token_expired(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    with pytest.raises(InviteExpiredError):
        invite_service.get_invite_by_token(
            db, invite.token, now=NOW + timedelta(days=invite_service.INVITE_EXPIRY_DAYS, seconds=1)
        )


def test_accept_invite_creates_user_and_marks_accepted(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)
    new_user_id = uuid.uuid4()

    created = invite_service.accept_invite(
        db, invite.token, new_user_id, "spouse2@example.com", "배우자", now=NOW
    )

    assert created.id == new_user_id
    assert created.email == "spouse2@example.com"
    assert created.display_name == "배우자"

    db.refresh(invite)
    assert invite.accepted_at == NOW

    with pytest.raises(InviteAlreadyAcceptedError):
        invite_service.get_invite_by_token(db, invite.token, now=NOW)


def test_accept_invite_rejects_mismatched_email(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    with pytest.raises(InviteEmailMismatchError):
        invite_service.accept_invite(
            db, invite.token, uuid.uuid4(), "someone-else@example.com", "배우자", now=NOW
        )


def test_cancel_invite(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)

    invite_service.cancel_invite(db, invite.id)

    assert invite_service.list_invites(db) == []
    with pytest.raises(InviteNotFoundError):
        invite_service.cancel_invite(db, invite.id)


def test_cancel_accepted_invite_raises(seeded_db, gmail_disconnected):
    db, user = seeded_db["db"], seeded_db["user"]
    invite = invite_service.create_invite(db, user.id, "spouse2@example.com", now=NOW)
    invite_service.accept_invite(db, invite.token, uuid.uuid4(), "spouse2@example.com", "배우자", now=NOW)

    with pytest.raises(InviteAlreadyAcceptedError):
        invite_service.cancel_invite(db, invite.id)
