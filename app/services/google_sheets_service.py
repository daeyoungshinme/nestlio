"""구글 시트에서 거래 내역(CSV/values)을 읽어오는 두 가지 경로.

- read_public_csv: 시트가 "링크가 있는 모든 사용자"로 공개된 경우, 구글이 제공하는
  CSV 내보내기 URL을 그대로 GET으로 읽는다. OAuth 연동이 전혀 필요 없다.
- read_values: google_auth의 OAuth 토큰(household.google_oauth_tokens)으로 Sheets API를
  호출해 비공개 시트도 읽는다. gmail_service/google_calendar_service와 동일한 패턴.
"""

import re

import httpx
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.services.google_auth import get_credentials

_TIMEOUT = 10.0
_SPREADSHEET_ID_RE = re.compile(r"/d/([a-zA-Z0-9-_]+)")
_GID_RE = re.compile(r"[?&#]gid=(\d+)")


class GoogleSheetsReadError(Exception):
    """구글 시트를 읽지 못했을 때 사용자에게 보여줄 한국어 메시지로 감싼 예외."""


def _service():
    return build("sheets", "v4", credentials=get_credentials(), cache_discovery=False)


def _extract_spreadsheet_id(value: str) -> str:
    """전체 URL과 순수 ID 문자열 둘 다 받아 spreadsheet ID만 뽑아낸다."""
    match = _SPREADSHEET_ID_RE.search(value)
    return match.group(1) if match else value.strip()


def read_values(spreadsheet_id: str, sheet_name: str | None = None) -> list[list[str]]:
    """OAuth로 연동된 구글 계정으로 Sheets API를 호출해 셀 값을 읽는다.
    spreadsheet_id는 순수 ID 또는 전체 URL 둘 다 받는다.
    sheet_name을 생략하면 Sheets API 기본 동작대로 첫 번째 탭을 읽는다."""
    range_ = f"'{sheet_name}'!A:F" if sheet_name else "A:F"
    try:
        result = (
            _service()
            .spreadsheets()
            .values()
            .get(spreadsheetId=_extract_spreadsheet_id(spreadsheet_id), range=range_)
            .execute()
        )
    except HttpError as exc:
        if exc.status_code in (403, 404):
            raise GoogleSheetsReadError(
                "시트를 찾을 수 없거나 연동된 구글 계정에 접근 권한이 없습니다."
            ) from exc
        raise
    return result.get("values", [])


def _parse_sheet_url(sheet_url: str) -> tuple[str, str]:
    id_match = _SPREADSHEET_ID_RE.search(sheet_url)
    if not id_match:
        raise GoogleSheetsReadError("올바른 구글 시트 링크가 아닙니다.")
    gid_match = _GID_RE.search(sheet_url)
    return id_match.group(1), gid_match.group(1) if gid_match else "0"


def read_public_csv(sheet_url: str) -> str:
    """'링크가 있는 모든 사용자'로 공유된 시트를 CSV 내보내기 URL로 읽는다."""
    spreadsheet_id, gid = _parse_sheet_url(sheet_url)
    export_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
    try:
        response = httpx.get(export_url, timeout=_TIMEOUT, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GoogleSheetsReadError("구글 시트에 연결하지 못했습니다.") from exc
    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        raise GoogleSheetsReadError(
            "시트가 비공개 상태입니다. '링크가 있는 모든 사용자'로 공유하거나 구글 계정 연동 방식을 사용하세요."
        )
    return response.text
