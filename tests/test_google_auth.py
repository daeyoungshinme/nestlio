from google.oauth2.credentials import Credentials

from app.models.google_oauth_token import GoogleOAuthToken
from app.services import google_auth


def test_is_connected_false_and_get_credentials_raises_when_no_token(db_session):
    assert google_auth.is_connected() is False

    try:
        google_auth.get_credentials()
        assert False, "expected GoogleNotConnectedError"
    except google_auth.GoogleNotConnectedError:
        pass


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
