"""gmail_service.send_email — 메시지 조립(제목 개행 제거, MIME 구조, 수신자)과
accessNotConfigured 분기. 다른 테스트는 send_email 자체를 patch하므로 이 조립 로직은
여기서만 검증한다.
"""
import base64
import email
import json
from email.header import decode_header, make_header
from unittest.mock import MagicMock, patch

import pytest

from app.services import gmail_service


def _sent_message(mock_service) -> email.message.Message:
    """_service()가 mock일 때, send()에 넘어간 raw 메시지를 파싱해서 돌려준다."""
    send_call = mock_service.return_value.users.return_value.messages.return_value.send
    raw = send_call.call_args.kwargs["body"]["raw"]
    return email.message_from_bytes(base64.urlsafe_b64decode(raw))


@patch("app.services.gmail_service._service")
def test_send_email_strips_newlines_from_subject(mock_service):
    gmail_service.send_email("카테고리\n주입\r시도", "본문", to="a@example.com")
    msg = _sent_message(mock_service)
    assert str(make_header(decode_header(msg["subject"]))) == "카테고리 주입 시도"


@patch("app.services.gmail_service._service")
def test_send_email_joins_list_recipients(mock_service):
    gmail_service.send_email("제목", "본문", to=["a@example.com", "b@example.com"])
    assert _sent_message(mock_service)["to"] == "a@example.com, b@example.com"


@patch("app.services.gmail_service._service")
def test_send_email_plain_only_is_single_part(mock_service):
    gmail_service.send_email("제목", "본문만", to="a@example.com")
    assert _sent_message(mock_service).get_content_type() == "text/plain"


@patch("app.services.gmail_service._service")
def test_send_email_with_html_is_multipart_alternative(mock_service):
    gmail_service.send_email("제목", "본문", to="a@example.com", html_body="<b>hi</b>")
    msg = _sent_message(mock_service)
    assert msg.get_content_type() == "multipart/alternative"
    assert {p.get_content_type() for p in msg.get_payload()} == {"text/plain", "text/html"}


@patch("app.services.gmail_service._service")
def test_send_email_maps_access_not_configured_to_friendly_error(mock_service):
    from googleapiclient.errors import HttpError

    resp = MagicMock()
    resp.status = 403
    content = json.dumps({"error": {"code": 403, "message": "accessNotConfigured"}}).encode()
    err = HttpError(resp=resp, content=content)
    mock_service.return_value.users.return_value.messages.return_value.send.return_value.execute.side_effect = err

    with pytest.raises(gmail_service.GmailSendError):
        gmail_service.send_email("제목", "본문", to="a@example.com")
