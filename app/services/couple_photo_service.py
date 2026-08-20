import time

import httpx

from app.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
OBJECT_KEY = "couple-photo"


class InvalidPhotoError(ValueError):
    pass


class PhotoStorageError(RuntimeError):
    pass


def _storage_configured() -> bool:
    return bool(settings.supabase_project_url and settings.supabase_service_role_key)


def _object_url() -> str:
    return f"{settings.supabase_project_url}/storage/v1/object/{settings.supabase_storage_bucket}/{OBJECT_KEY}"


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


def save_photo(raw: bytes, content_type: str | None) -> str:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise InvalidPhotoError("jpg/png/webp 형식의 이미지만 업로드할 수 있습니다.")
    max_bytes = int(settings.max_upload_size_mb * 1024 * 1024)
    if len(raw) > max_bytes:
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
        raise PhotoStorageError(f"사진 업로드에 실패했습니다: {resp.status_code} {resp.text}")
    return f"/media/{OBJECT_KEY}?t={int(time.time())}"


def _is_not_found(resp: httpx.Response) -> bool:
    # Supabase Storage는 존재하지 않는 버킷/오브젝트에 대해 404가 아니라
    # 400(NoSuchBucket 등)을 반환하는 경우가 있어, 상태 코드만으로 진짜 서버 오류와
    # 구분되지 않는다. 이 서비스는 고정된 오브젝트 키만 조회하므로(사용자 입력 없음),
    # 400은 곧 "버킷/파일이 아직 없음"으로 취급해도 안전하다.
    return resp.status_code in (404, 400)


def get_photo_url() -> str | None:
    if not _storage_configured():
        return None
    try:
        resp = httpx.head(_object_url(), headers=_auth_headers(), timeout=10)
    except httpx.HTTPError as exc:
        raise PhotoStorageError("사진 조회 중 네트워크 오류가 발생했습니다.") from exc
    if _is_not_found(resp):
        return None
    if resp.status_code >= 400:
        raise PhotoStorageError(f"사진 조회에 실패했습니다: {resp.status_code} {resp.text}")
    return f"/media/{OBJECT_KEY}?t={int(time.time())}"


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
        raise PhotoStorageError(f"사진 조회에 실패했습니다: {resp.status_code} {resp.text}")
    content_type = resp.headers.get("content-type", "application/octet-stream")
    return resp.content, content_type


def delete_photo() -> None:
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
        raise PhotoStorageError(f"사진 삭제에 실패했습니다: {resp.status_code} {resp.text}")
