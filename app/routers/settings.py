from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.settings import (
    CoachingThresholdsIn,
    NotificationPrefsIn,
    NotifyEmailsIn,
    SettingsOut,
    TestEmailResultOut,
)
from app.services import (
    coaching_settings_service,
    couple_photo_service,
    notification_service,
    notification_settings_service,
    settings_service,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return settings_service.build_settings_out(db)


@router.put("/notify-emails", response_model=SettingsOut)
def set_notify_emails(
    payload: NotifyEmailsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification_settings_service.set_recipients(db, payload.emails, current_user.id)
    return settings_service.build_settings_out(db)


@router.put("/coaching-thresholds", response_model=SettingsOut)
def set_coaching_thresholds(
    payload: CoachingThresholdsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coaching_settings_service.set_thresholds(db, payload.model_dump(), current_user.id)
    return settings_service.build_settings_out(db)


@router.put("/notification-prefs", response_model=SettingsOut)
def set_notification_prefs(
    payload: NotificationPrefsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification_settings_service.set_prefs(db, payload.model_dump(), current_user.id)
    return settings_service.build_settings_out(db)


@router.post("/couple-photo", response_model=SettingsOut)
def upload_couple_photo(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    # async def가 아니라 def — 스토리지 업로드(httpx 동기, 최대 30초)와 DB 조회가 블로킹이라
    # 이벤트 루프에서 돌면 단일 프로세스(Render) 전체 요청이 그동안 멈춘다. def는 스레드풀에서 돈다.
    # 상한+1바이트까지만 읽는다 — 크기 초과 판정은 save_photo가 그대로 한다(전체를 메모리에 올리지 않음).
    raw = file.file.read(int(settings.max_upload_size_mb * 1024 * 1024) + 1)
    couple_photo_service.save_photo(raw, file.content_type)
    return settings_service.build_settings_out(db)


@router.delete("/couple-photo", response_model=SettingsOut)
def delete_couple_photo(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    couple_photo_service.delete_photo()
    return settings_service.build_settings_out(db)


@router.post("/test-weekly-email", response_model=TestEmailResultOut)
def test_weekly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return notification_service.send_test_summary(db, "weekly")


@router.post("/test-monthly-email", response_model=TestEmailResultOut)
def test_monthly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return notification_service.send_test_summary(db, "monthly")
