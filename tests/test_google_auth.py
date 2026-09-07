from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from app.models.google_oauth_token import GoogleOAuthToken
from app.services import google_auth

_PAST = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=2)
_FUTURE = datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)


def _add_token(db, *, refresh_token="ref", expiry=None, access_token="tok"):
    db.add(
        GoogleOAuthToken(
            access_token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=",".join(google_auth.SCOPES),
            expiry=expiry,
        )
    )
    db.commit()


def test_is_connected_false_and_get_credentials_raises_when_no_token(db_session):
    assert google_auth.is_connected() is False

    with pytest.raises(google_auth.GoogleNotConnectedError):
        google_auth.get_credentials()


def test_is_connected_true_when_token_row_exists_and_not_expired(db_session):
    db_session.add(
        GoogleOAuthToken(
            access_token="tok",
            refresh_token="ref",
            token_uri="https://oauth2.googleapis.com/token",
            scopes=",".join(google_auth.SCOPES),
            expiry=None,
        )
    )
    db_session.commit()

    assert google_auth.is_connected() is True
    creds = google_auth.get_credentials()
    assert creds.token == "tok"


def test_get_credentials_refreshes_and_persists_when_expired(db_session):
    _add_token(db_session, expiry=_PAST, access_token="stale")

    def fake_refresh(self, request):
        self.token = "fresh-tok"
        self.expiry = _FUTURE

    with patch.object(Credentials, "refresh", fake_refresh):
        creds = google_auth.get_credentials()

    assert creds.token == "fresh-tok"
    row = db_session.query(GoogleOAuthToken).first()
    assert row.access_token == "fresh-tok"
    assert row.expiry == _FUTURE


def test_get_credentials_raises_when_expired_without_refresh_token(db_session):
    _add_token(db_session, refresh_token=None, expiry=_PAST)

    with pytest.raises(google_auth.GoogleAuthError):
        google_auth.get_credentials()


def test_get_credentials_converts_refresh_error(db_session):
    _add_token(db_session, expiry=_PAST)

    def boom(self, request):
        raise RefreshError("invalid_grant")

    with patch.object(Credentials, "refresh", boom), pytest.raises(google_auth.GoogleAuthError):
        google_auth.get_credentials()


def test_save_credentials_upserts_singleton_row(db_session):
    creds1 = Credentials(
        token="tok1",
        refresh_token="ref1",
        token_uri="https://oauth2.googleapis.com/token",
        client_id="cid",
        client_secret="csecret",
        scopes=google_auth.SCOPES,
    )
    google_auth.save_credentials(creds1)

    creds2 = Credentials(
        token="tok2",
        refresh_token="ref2",
        token_uri="https://oauth2.googleapis.com/token",
        client_id="cid",
        client_secret="csecret",
        scopes=google_auth.SCOPES,
    )
    google_auth.save_credentials(creds2)

    rows = db_session.query(GoogleOAuthToken).all()
    assert len(rows) == 1
    assert rows[0].access_token == "tok2"
