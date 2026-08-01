import base64
from email.mime.text import MIMEText

from googleapiclient.discovery import build

from app.config import settings
from app.services.google_auth import get_credentials


def _service():
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def send_email(subject: str, body_text: str, to: str | None = None) -> None:
    message = MIMEText(body_text)
    message["to"] = to or settings.notify_email_to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    _service().users().messages().send(userId="me", body={"raw": raw}).execute()
