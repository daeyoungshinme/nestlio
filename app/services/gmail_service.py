import base64
from email.mime.text import MIMEText

from googleapiclient.discovery import build

from app.config import settings
from app.services.google_auth import get_credentials


def _service():
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def send_email(subject: str, body_text: str, to: str | None = None) -> None:
    # subject는 카테고리명/목표명/일정 제목 등 사용자가 자유롭게 입력한 문자열을 포함할 수 있다 -
    # 개행이 섞이면 email 라이브러리가 헤더 파싱 예외를 던지므로 여기서 한 번에 제거한다.
    safe_subject = subject.replace("\r", " ").replace("\n", " ")
    message = MIMEText(body_text)
    message["to"] = to or settings.notify_email_to
    message["subject"] = safe_subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    _service().users().messages().send(userId="me", body={"raw": raw}).execute()
