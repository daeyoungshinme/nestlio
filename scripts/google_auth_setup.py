"""One-time Google OAuth setup for Calendar + Gmail send + Sheets read access.

Prerequisites (do this once in Google Cloud Console, https://console.cloud.google.com/):
  1. Create a project (or reuse one).
  2. Enable "Google Calendar API", "Gmail API", and "Google Sheets API" under
     APIs & Services > Library.
  3. Configure the OAuth consent screen (External is fine for personal use; add your
     own Google account under "Test users" if the app stays in Testing mode).
  4. Create credentials > OAuth client ID > Application type "Desktop app".
  5. Put the client ID/secret into .env as GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.

Then run: .venv/Scripts/python.exe scripts/google_auth_setup.py
A browser window will open for you to sign in and consent. The resulting token is
saved to the household.google_oauth_tokens table (same Supabase Postgres the deployed
app uses via .env's DATABASE_URL) - run this once locally and the deployed app picks
it up immediately, no redeploy needed. The running app auto-refreshes it from there.

NOTE: SCOPES 목록에 새 스코프를 추가했다면(예: spreadsheets.readonly), 기존에 이미
연동되어 있었더라도 이 스크립트를 다시 실행해 재동의해야 한다 - 저장된 리프레시 토큰은
최초 동의 시점의 스코프로 고정되어 있어, 코드만 바꾼다고 새 스코프가 자동으로 붙지 않는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import settings
from app.services.google_auth import SCOPES, save_credentials


def main():
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        print("오류: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET이 .env에 설정되어 있지 않습니다.")
        print("Google Cloud Console에서 OAuth 클라이언트(Desktop app)를 만들고 .env에 값을 채운 뒤 다시 실행하세요.")
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0)
    save_credentials(creds)
    print("연결 완료. 토큰이 household.google_oauth_tokens 테이블에 저장되었습니다.")


if __name__ == "__main__":
    main()
