"""설정 화면 응답(SettingsOut) 조립 — 설정 라우터의 모든 쓰기 엔드포인트와 대시보드 bootstrap이 같은 모양을
돌려주므로 한 곳에 둔다. 저장은 각 도메인 서비스(notification_settings_service·coaching_settings_service·
couple_photo_service)가 맡는다."""

from sqlalchemy.orm import Session

from app.services import coaching_settings_service, couple_photo_service, notification_settings_service
from app.services.google_auth import is_connected


def build_settings_out(db: Session) -> dict:
    return {
        "google_connected": is_connected(),
        "notify_emails": notification_settings_service.get_recipients(db),
        "coaching_thresholds": coaching_settings_service.get_thresholds(db),
        "notification_prefs": notification_settings_service.get_prefs(db),
        "couple_photo_url": couple_photo_service.photo_url_for_display(),
    }
