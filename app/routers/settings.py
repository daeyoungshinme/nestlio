from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.settings import EmergencyFundIn, SettingsOut, TestEmailResultOut
from app.services import couple_photo_service, notification_service, user_setting_service
from app.services.google_auth import GoogleNotConnectedError, is_connected

router = APIRouter(prefix="/settings", tags=["settings"])


def _settings_out(db: Session) -> dict:
    return {
        "google_connected": is_connected(),
        "notify_email_to": app_settings.notify_email_to,
        "budget_warn_pct": app_settings.budget_warn_pct,
        "budget_critical_pct": app_settings.budget_critical_pct,
        "emergency_fund_balance": user_setting_service.get_shared_setting(
            db, user_setting_service.EMERGENCY_FUND_BALANCE_KEY, None
        ),
        "couple_photo_url": couple_photo_service.get_photo_url(),
    }


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _settings_out(db)


@router.put("/emergency-fund", response_model=SettingsOut)
def set_emergency_fund(
    payload: EmergencyFundIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_setting_service.set_shared_setting(
        db, user_setting_service.EMERGENCY_FUND_BALANCE_KEY, str(payload.balance), current_user.id
    )
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
    return _settings_out(db)


@router.delete("/couple-photo", response_model=SettingsOut)
def delete_couple_photo(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    couple_photo_service.delete_photo()
    return _settings_out(db)


@router.post("/test-weekly-email", response_model=TestEmailResultOut)
def test_weekly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        sent = notification_service.send_weekly_summary(db, force=True)
    except GoogleNotConnectedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Google 계정이 연결되어 있지 않습니다."
        ) from None
    return {"sent": sent, "message": "주간 요약 이메일을 발송했습니다." if sent else "발송하지 못했습니다."}


@router.post("/test-monthly-email", response_model=TestEmailResultOut)
def test_monthly(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        sent = notification_service.send_monthly_summary(db, force=True)
    except GoogleNotConnectedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Google 계정이 연결되어 있지 않습니다."
        ) from None
    return {"sent": sent, "message": "월간 요약 이메일을 발송했습니다." if sent else "발송하지 못했습니다."}
