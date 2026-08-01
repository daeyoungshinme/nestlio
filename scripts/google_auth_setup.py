"""One-time Google OAuth setup for Calendar + Gmail send access.

Prerequisites (do this once in Google Cloud Console, https://console.cloud.google.com/):
  1. Create a project (or reuse one).
  2. Enable "Google Calendar API" and "Gmail API" under APIs & Services > Library.
  3. Configure the OAuth consent screen (External is fine for personal use; add your
     own Google account under "Test users" if the app stays in Testing mode).
  4. Create credentials > OAuth client ID > Application type "Desktop app".
  5. Download the JSON and save it as: data/client_secret.json

Then run: .venv/Scripts/python.exe scripts/google_auth_setup.py
A browser window will open for you to sign in and consent. After that,
data/token.json is created and the running app will auto-refresh it - no
further manual steps needed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google_auth_oauthlib.flow import InstalledAppFlow

from app.services.google_auth import CLIENT_SECRET_PATH, SCOPES, TOKEN_PATH


def main():
    if not CLIENT_SECRET_PATH.exists():
        print(f"오류: {CLIENT_SECRET_PATH} 파일이 없습니다.")
        print("Google Cloud Console에서 OAuth 클라이언트(Desktop app)를 만들고 JSON을 다운로드해")
        print(f"{CLIENT_SECRET_PATH} 경로에 저장한 뒤 다시 실행하세요.")
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_PATH), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    print(f"연결 완료. 토큰이 저장되었습니다: {TOKEN_PATH}")


if __name__ == "__main__":
    main()
