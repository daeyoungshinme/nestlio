import time
from pathlib import Path

from app.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
FILENAME_STEM = "couple_photo"


class InvalidPhotoError(ValueError):
    pass


def _upload_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _existing_files() -> list[Path]:
    return list(_upload_dir().glob(f"{FILENAME_STEM}.*"))


def save_photo(raw: bytes, content_type: str | None) -> str:
    ext = ALLOWED_CONTENT_TYPES.get(content_type or "")
    if ext is None:
        raise InvalidPhotoError("jpg/png/webp 형식의 이미지만 업로드할 수 있습니다.")
    max_bytes = int(settings.max_upload_size_mb * 1024 * 1024)
    if len(raw) > max_bytes:
        raise InvalidPhotoError(f"파일 크기는 {settings.max_upload_size_mb:g}MB를 넘을 수 없습니다.")

    for old in _existing_files():
        old.unlink()

    dest = _upload_dir() / f"{FILENAME_STEM}{ext}"
    dest.write_bytes(raw)
    return f"/media/{dest.name}?t={int(time.time())}"


def get_photo_url() -> str | None:
    files = _existing_files()
    if not files:
        return None
    photo = files[0]
    return f"/media/{photo.name}?t={int(photo.stat().st_mtime)}"


def delete_photo() -> None:
    for old in _existing_files():
        old.unlink()
