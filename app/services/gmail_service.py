import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings
from app.services.google_auth import get_credentials


class GmailSendError(Exception):
    """Gmail API 호출이 실패했을 때 사용자에게 보여줄 한국어 메시지로 감싼 예외."""


def _service():
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def send_email(
    subject: str, body_text: str, to: str | list[str] | None = None, html_body: str | None = None
) -> None:
    # subject는 카테고리명/목표명/일정 제목 등 사용자가 자유롭게 입력한 문자열을 포함할 수 있다 -
    # 개행이 섞이면 email 라이브러리가 헤더 파싱 예외를 던지므로 여기서 한 번에 제거한다.
    safe_subject = subject.replace("\r", " ").replace("\n", " ")
    if html_body is not None:
        # HTML을 지원하지 않는 클라이언트/스팸 필터를 위해 텍스트 파트를 함께 담는다.
        message = MIMEMultipart("alternative")
        message.attach(MIMEText(body_text, "plain"))
        message.attach(MIMEText(html_body, "html"))
    else:
        message = MIMEText(body_text)
    recipients = to or settings.notify_email_to
    message["to"] = ", ".join(recipients) if isinstance(recipients, list) else recipients
    message["subject"] = safe_subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    try:
        _service().users().messages().send(userId="me", body={"raw": raw}).execute()
    except HttpError as exc:
        if exc.status_code == 403 and "accessNotConfigured" in str(exc.error_details):
            raise GmailSendError(
                "Gmail API가 비활성화되어 있습니다. Google Cloud Console에서 Gmail API를 활성화한 뒤 다시 시도해주세요."
            ) from exc
        raise
