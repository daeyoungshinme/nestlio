from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
TOKEN_PATH = DATA_DIR / "token.json"
CLIENT_SECRET_PATH = DATA_DIR / "client_secret.json"

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
]


class GoogleNotConnectedError(Exception):
    """Raised when data/token.json is missing - run scripts/google_auth_setup.py first."""


def is_connected() -> bool:
    return TOKEN_PATH.exists()


def get_credentials() -> Credentials:
    if not TOKEN_PATH.exists():
        raise GoogleNotConnectedError(
            "Google 계정이 연결되어 있지 않습니다. scripts/google_auth_setup.py를 먼저 실행하세요."
        )
    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    return creds
