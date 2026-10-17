import logging
import uuid

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import InvalidInputError, UpstreamError
from app.services import user_setting_service
from app.utils.dates import now_kst

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
OBJECT_KEY = "couple-photo"
# 사진 버전(업로드 시각). 설정·bootstrap 응답마다 스토리지에 HEAD를 보내지 않고 이 값으로 URL을 만든다 —
# 버전이 바뀔 때만 URL이 바뀌어 브라우저 캐시도 쓸 수 있다. 값이 ""이면 "사진 없음", 행이 없으면 이 기록을
# 도입하기 전에 올린 사진일 수 있어 한 번 확인한다(get_photo_url).
VERSION_KEY = "couple_photo_version"
NO_PHOTO = ""


class InvalidPhotoError(InvalidInputError):
    pass


class PhotoStorageError(UpstreamError):
    pass


def _storage_failure(message: str, resp: httpx.Response) -> PhotoStorageError:
    """스토리지 응답 본문은 로그에만 남긴다 — 예외 문구는 그대로 클라이언트 detail이 된다."""
    logger.warning("couple_photo_storage_error status=%s body=%s", resp.status_code, resp.text[:500])
    return PhotoStorageError(f"{message} (스토리지 오류 {resp.status_code})")


def _storage_configured() -> bool:
    return bool(settings.supabase_project_url and settings.supabase_service_role_key)


def _object_url() -> str:
    return f"{settings.supabase_project_url}/storage/v1/object/{settings.supabase_storage_bucket}/{OBJECT_KEY}"


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


def _photo_url(version: str) -> str:
    return f"/media/{OBJECT_KEY}?v={version}"


def _new_version() -> str:
    return now_kst().strftime("%Y%m%d%H%M%S")


def save_photo(db: Session, raw: bytes, content_type: str | None, user_id: uuid.UUID) -> str:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise InvalidPhotoError("jpg/png/webp 형식의 이미지만 업로드할 수 있습니다.")
    if len(raw) > settings.max_upload_bytes:
        raise InvalidPhotoError(f"파일 크기는 {settings.max_upload_size_mb:g}MB를 넘을 수 없습니다.")
    if not _storage_configured():
        raise PhotoStorageError("SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않아 사진을 저장할 수 없습니다.")

    try:
        resp = httpx.put(
            _object_url(),
            content=raw,
            headers={**_auth_headers(), "Content-Type": content_type, "x-upsert": "true"},
            timeout=30,
        )
    except httpx.HTTPError as exc:
        raise PhotoStorageError("사진 업로드 중 네트워크 오류가 발생했습니다.") from exc
    if resp.status_code >= 400:
        raise _storage_failure("사진 업로드에 실패했습니다.", resp)
    version = _new_version()
    user_setting_service.set_shared_setting(db, VERSION_KEY, version, user_id)
    return _photo_url(version)


def _is_not_found(resp: httpx.Response) -> bool:
    # Supabase Storage는 존재하지 않는 버킷/오브젝트에 대해 404가 아니라
    # 400(NoSuchBucket 등)을 반환하는 경우가 있어, 상태 코드만으로 진짜 서버 오류와
    # 구분되지 않는다. 이 서비스는 고정된 오브젝트 키만 조회하므로(사용자 입력 없음),
    # 400은 곧 "버킷/파일이 아직 없음"으로 취급해도 안전하다.
    return resp.status_code in (404, 400)


def _probe_legacy_version() -> str:
    """버전 기록이 없을 때 스토리지에 사진이 있는지 HEAD로 확인한다 — 있으면 새 버전, 없으면 NO_PHOTO."""
    try:
        resp = httpx.head(_object_url(), headers=_auth_headers(), timeout=10)
    except httpx.HTTPError as exc:
        raise PhotoStorageError("사진 조회 중 네트워크 오류가 발생했습니다.") from exc
    if _is_not_found(resp):
        return NO_PHOTO
    if resp.status_code >= 400:
        raise _storage_failure("사진 조회에 실패했습니다.", resp)
    return _new_version()


def get_photo_url(db: Session, user_id: uuid.UUID) -> str | None:
    """저장된 버전으로 URL을 만든다(스토리지 요청 없음). 버전 기록이 없으면(기록 도입 전에 올린 사진) 한 번만
    HEAD로 확인해 결과를 기록한다 — 이후로는 업로드·삭제가 기록을 갱신한다."""
    if not _storage_configured():
        return None
    version = user_setting_service.get_shared_setting(db, VERSION_KEY)
    if version is None:
        version = _probe_legacy_version()
        user_setting_service.set_shared_setting(db, VERSION_KEY, version, user_id)
    return _photo_url(version) if version else None


def photo_url_for_display(db: Session, user_id: uuid.UUID) -> str | None:
    """설정/대시보드 응답에 싣는 용도의 get_photo_url — 스토리지 장애(네트워크·5xx)는 로그만 남기고
    "사진 없음"으로 취급한다. 사진 하나 때문에 설정 화면·대시보드 전체가 500이 되면 안 된다."""
    try:
        return get_photo_url(db, user_id)
    except PhotoStorageError:
        logger.warning("couple_photo_lookup_failed", exc_info=True)
        return None


def get_photo_bytes() -> tuple[bytes, str] | None:
    if not _storage_configured():
        return None
    try:
        resp = httpx.get(_object_url(), headers=_auth_headers(), timeout=30)
    except httpx.HTTPError as exc:
        raise PhotoStorageError("사진 조회 중 네트워크 오류가 발생했습니다.") from exc
    if _is_not_found(resp):
        return None
    if resp.status_code >= 400:
        raise _storage_failure("사진 조회에 실패했습니다.", resp)
    content_type = resp.headers.get("content-type", "application/octet-stream")
    return resp.content, content_type


def delete_photo(db: Session, user_id: uuid.UUID) -> None:
    if not _storage_configured():
        return
    try:
        resp = httpx.request(
            "DELETE",
            f"{settings.supabase_project_url}/storage/v1/object/{settings.supabase_storage_bucket}",
            headers=_auth_headers(),
            json={"prefixes": [OBJECT_KEY]},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise PhotoStorageError("사진 삭제 중 네트워크 오류가 발생했습니다.") from exc
    if resp.status_code >= 400 and not _is_not_found(resp):
        raise _storage_failure("사진 삭제에 실패했습니다.", resp)
    user_setting_service.set_shared_setting(db, VERSION_KEY, NO_PHOTO, user_id)
