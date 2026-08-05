from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from app.config import settings
from app.database import SessionLocal
from app.models.google_oauth_token import GoogleOAuthToken

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
]


class GoogleNotConnectedError(Exception):
    """Raised when no GoogleOAuthToken row exists - run scripts/google_auth_setup.py first."""


# 아래 두 함수는 app/services/CLAUDE.md의 "첫 인자는 항상 db" 규칙에 대한 예외다.
# 스케줄러 잡(app/scheduler/jobs.py)과 동일하게 자체 SessionLocal()을 열고 닫는 패턴을 써서,
# 이미 인자 없이 호출 중인 ~10곳의 호출부(notification_service, event_service,
# google_calendar_service, gmail_service, app/routers/settings.py 등)를 건드리지 않는다.


def is_connected() -> bool:
    db = SessionLocal()
    try:
        return db.query(GoogleOAuthToken).first() is not None
    finally:
        db.close()


def get_credentials() -> Credentials:
    db = SessionLocal()
    try:
        row = db.query(GoogleOAuthToken).first()
        if row is None:
            raise GoogleNotConnectedError(
                "Google 계정이 연결되어 있지 않습니다. scripts/google_auth_setup.py를 먼저 실행하세요."
            )
        creds = Credentials(
            token=row.access_token,
            refresh_token=row.refresh_token,
            token_uri=row.token_uri,
            client_id=settings.google_oauth_client_id,
            client_secret=settings.google_oauth_client_secret,
            scopes=row.scopes.split(","),
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            row.access_token = creds.token
            row.expiry = creds.expiry
            db.commit()
        return creds
    finally:
        db.close()


def save_credentials(creds: Credentials) -> None:
    """scripts/google_auth_setup.py 전용 — 최초 연결 시 싱글톤 행을 생성/갱신한다."""
    db = SessionLocal()
    try:
        row = db.query(GoogleOAuthToken).first()
        if row is None:
            row = GoogleOAuthToken()
            db.add(row)
        row.access_token = creds.token
        row.refresh_token = creds.refresh_token
        row.token_uri = creds.token_uri
        row.scopes = ",".join(creds.scopes or SCOPES)
        row.expiry = creds.expiry
        db.commit()
    finally:
        db.close()
