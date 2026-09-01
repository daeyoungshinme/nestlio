from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

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
)
from app.services.gmail_service import GmailSendError
from app.services.google_auth import is_connected

router = APIRouter(prefix="/settings", tags=["settings"])


def _settings_out(db: Session) -> dict:
    return {
        "google_connected": is_connected(),
        "notify_emails": notification_settings_service.get_recipients(db),
        "coaching_thresholds": coaching_settings_service.get_thresholds(db),
        "notification_prefs": notification_settings_service.get_prefs(db),
        "couple_photo_url": couple_photo_service.get_photo_url(),
    }


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _settings_out(db)


@router.put("/notify-emails", response_model=SettingsOut)
def set_notify_emails(
    payload: NotifyEmailsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification_settings_service.set_recipients(db, payload.emails, current_user.id)
    return _settings_out(db)


@router.put("/coaching-thresholds", response_model=SettingsOut)
def set_coaching_thresholds(
    payload: CoachingThresholdsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coaching_settings_service.set_thresholds(db, payload.model_dump(), current_user.id)
    return _settings_out(db)


@router.put("/notification-prefs", response_model=SettingsOut)
def set_notification_prefs(
    payload: NotificationPrefsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification_settings_service.set_prefs(db, payload.model_dump(), current_user.id)
    return _settings_out(db)


@router.post("/couple-photo", response_model=SettingsOut)
async def upload_couple_photo(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    raw = await file.read()
    try:
        couple_photo_service.save_photo(raw, file.content_type)
    except couple_photo_service.InvalidPhotoError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    except couple_photo_service.PhotoStorageError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    return _settings_out(db)


@router.delete("/couple-photo", response_model=SettingsOut)
def delete_couple_photo(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        couple_photo_service.delete_photo()
    except couple_photo_service.PhotoStorageError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    return _settings_out(db)


def _run_test_email(db: Session, *, setting_key: str, label: str, send) -> dict:
    # 이 엔드포인트들은 "Google 연동이 실제로 동작하는지" 확인하는 QA용 버튼이므로, 일반
    # 알림 파이프라인과 달리 미연동/꺼짐 상태에서는 조용히 건너뛰지 않고 409로 알린다.
    if not is_connected():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Google 계정이 연결되어 있지 않습니다.")
    if not notification_settings_service.is_enabled(db, setting_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"{label} 요약 알림이 꺼져 있습니다. 설정에서 켜주세요."
        )
    try:
        sent = send(db, force=True)
    except GmailSendError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
    return {"sent": sent, "message": f"{label} 요약 이메일을 발송했습니다." if sent else "발송하지 못했습니다."}


@router.post("/test-weekly-email", response_model=TestEmailResultOut)
def test_weekly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _run_test_email(
        db, setting_key="email_weekly", label="주간", send=notification_service.send_weekly_summary
    )


@router.post("/test-monthly-email", response_model=TestEmailResultOut)
def test_monthly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _run_test_email(
        db, setting_key="email_monthly", label="월간", send=notification_service.send_monthly_summary
    )
