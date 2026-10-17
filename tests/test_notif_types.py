import re
from pathlib import Path
from typing import get_args

from app.schemas.notification import NotifType
from app.services import notification_settings_service

SERVICES = Path(__file__).resolve().parent.parent / "app" / "services"
# notif_type으로 쓰이는 문자열: log_sent(db, "x", ...), notif_type="x", *NOTIF_TYPE = "x", notif_type = "a" if ... else "b"
_PATTERNS = (
    r'log_sent\(\s*db,\s*"([a-z_]+)"',
    r'notif_type="([a-z_]+)"',
    r'NOTIF_TYPE = "([a-z_]+)"',
    r'notif_type = "([a-z_]+)" if .+ else "([a-z_]+)"',
)


def _notif_types_in_services() -> set[str]:
    found: set[str] = set()
    for path in SERVICES.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        for pattern in _PATTERNS:
            for match in re.finditer(pattern, text):
                found.update(g for g in match.groups() if g)
    return found


def test_every_notif_type_written_by_services_is_in_output_literal():
    """새 알림 종류를 쓰면서 NotifType에 안 넣으면 알림함에 "other"로 뭉개진다."""
    known = set(get_args(NotifType)) - {"other"}
    written = _notif_types_in_services()
    assert written, "패턴이 아무것도 못 찾음 — 정규식이 코드와 어긋났다"
    assert written <= known, written - known
    assert set(notification_settings_service.NOTIF_TYPES) <= known
