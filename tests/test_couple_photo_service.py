from unittest.mock import patch

import httpx
import pytest

from app.services import couple_photo_service, user_setting_service


def _configure_storage(monkeypatch):
    monkeypatch.setattr(couple_photo_service.settings, "supabase_project_url", "https://example.supabase.co")
    monkeypatch.setattr(couple_photo_service.settings, "supabase_service_role_key", "service-role-key")


def _ok(method):
    return httpx.Response(200, request=httpx.Request(method, "https://example.com"))


def test_storage_not_configured_returns_safe_defaults(monkeypatch, seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    monkeypatch.setattr(couple_photo_service.settings, "supabase_project_url", "")
    monkeypatch.setattr(couple_photo_service.settings, "supabase_service_role_key", "")

    assert couple_photo_service.get_photo_url(db, user.id) is None
    assert couple_photo_service.get_photo_bytes() is None
    couple_photo_service.delete_photo(db, user.id)  # no-op, must not raise

    with pytest.raises(couple_photo_service.PhotoStorageError):
        couple_photo_service.save_photo(db, b"fake-bytes", "image/jpeg", user.id)


@pytest.mark.parametrize(
    "func_name,httpx_func",
    [
        ("save_photo", "put"),
        ("get_photo_url", "head"),
        ("get_photo_bytes", "get"),
        ("delete_photo", "request"),
    ],
)
def test_network_error_is_converted_to_photo_storage_error(monkeypatch, seeded_db, func_name, httpx_func):
    db, user = seeded_db["db"], seeded_db["user"]
    _configure_storage(monkeypatch)
    call = {
        "save_photo": lambda: couple_photo_service.save_photo(db, b"fake-bytes", "image/jpeg", user.id),
        # 버전 기록이 없는(기록 도입 전) 상태라 HEAD로 확인한다.
        "get_photo_url": lambda: couple_photo_service.get_photo_url(db, user.id),
        "get_photo_bytes": couple_photo_service.get_photo_bytes,
        "delete_photo": lambda: couple_photo_service.delete_photo(db, user.id),
    }[func_name]

    with patch(f"app.services.couple_photo_service.httpx.{httpx_func}", side_effect=httpx.ConnectError("boom")):
        with pytest.raises(couple_photo_service.PhotoStorageError):
            call()


def test_photo_url_comes_from_stored_version_without_storage_requests(monkeypatch, seeded_db):
    """업로드가 기록한 버전으로 URL을 만든다 — 설정·bootstrap 응답마다 스토리지 HEAD를 보내지 않는다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _configure_storage(monkeypatch)

    with patch("app.services.couple_photo_service.httpx.put", return_value=_ok("PUT")):
        uploaded_url = couple_photo_service.save_photo(db, b"fake-bytes", "image/jpeg", user.id)

    with patch("app.services.couple_photo_service.httpx") as mock_httpx:
        assert couple_photo_service.get_photo_url(db, user.id) == uploaded_url
        assert couple_photo_service.get_photo_url(db, user.id) == uploaded_url
    assert mock_httpx.mock_calls == []
    assert uploaded_url.startswith("/media/couple-photo?v=")

    with patch("app.services.couple_photo_service.httpx.request", return_value=_ok("DELETE")):
        couple_photo_service.delete_photo(db, user.id)
    with patch("app.services.couple_photo_service.httpx") as mock_httpx:
        assert couple_photo_service.get_photo_url(db, user.id) is None
    assert mock_httpx.mock_calls == []


@pytest.mark.parametrize("head_status,expected_photo", [(200, True), (404, False)])
def test_legacy_photo_is_probed_once_and_recorded(monkeypatch, seeded_db, head_status, expected_photo):
    """버전 기록이 없으면(기록 도입 전에 올린 사진) HEAD로 한 번만 확인하고 결과를 기록한다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _configure_storage(monkeypatch)
    head = httpx.Response(head_status, request=httpx.Request("HEAD", "https://example.com"))

    with patch("app.services.couple_photo_service.httpx.head", return_value=head) as mock_head:
        first = couple_photo_service.get_photo_url(db, user.id)
        second = couple_photo_service.get_photo_url(db, user.id)

    assert mock_head.call_count == 1
    assert first == second
    assert (first is not None) is expected_photo
    assert user_setting_service.get_shared_setting(db, couple_photo_service.VERSION_KEY) is not None


def test_is_not_found_treats_404_and_400_as_not_found_but_not_500():
    resp_404 = httpx.Response(404, request=httpx.Request("GET", "https://example.com"))
    resp_400 = httpx.Response(400, request=httpx.Request("GET", "https://example.com"))
    resp_500 = httpx.Response(500, request=httpx.Request("GET", "https://example.com"))

    assert couple_photo_service._is_not_found(resp_404) is True
    assert couple_photo_service._is_not_found(resp_400) is True
    assert couple_photo_service._is_not_found(resp_500) is False


def test_storage_error_detail_does_not_include_upstream_body(monkeypatch, seeded_db):
    """스토리지 응답 본문(내부 버킷명·에러 JSON)은 로그에만 — 예외 문구는 그대로 클라이언트 detail이 된다."""
    db, user = seeded_db["db"], seeded_db["user"]
    _configure_storage(monkeypatch)
    failed = httpx.Response(500, text='{"error":"internal bucket secret-xyz"}', request=httpx.Request("HEAD", "https://e"))

    with patch("app.services.couple_photo_service.httpx.head", return_value=failed):
        with pytest.raises(couple_photo_service.PhotoStorageError) as exc_info:
            couple_photo_service.get_photo_url(db, user.id)
    assert "secret-xyz" not in str(exc_info.value)
    assert "500" in str(exc_info.value)
    # 장애는 기록하지 않는다 — 다음 요청이 다시 확인한다.
    assert user_setting_service.get_shared_setting(db, couple_photo_service.VERSION_KEY) is None
