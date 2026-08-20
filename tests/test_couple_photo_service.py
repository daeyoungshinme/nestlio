from unittest.mock import patch

import httpx
import pytest

from app.services import couple_photo_service


def _configure_storage(monkeypatch):
    monkeypatch.setattr(couple_photo_service.settings, "supabase_project_url", "https://example.supabase.co")
    monkeypatch.setattr(couple_photo_service.settings, "supabase_service_role_key", "service-role-key")


def test_storage_not_configured_returns_safe_defaults(monkeypatch):
    monkeypatch.setattr(couple_photo_service.settings, "supabase_project_url", "")
    monkeypatch.setattr(couple_photo_service.settings, "supabase_service_role_key", "")

    assert couple_photo_service.get_photo_url() is None
    assert couple_photo_service.get_photo_bytes() is None
    couple_photo_service.delete_photo()  # no-op, must not raise

    with pytest.raises(couple_photo_service.PhotoStorageError):
        couple_photo_service.save_photo(b"fake-bytes", "image/jpeg")


@pytest.mark.parametrize(
    "func_name,httpx_func",
    [
        ("save_photo", "put"),
        ("get_photo_url", "head"),
        ("get_photo_bytes", "get"),
        ("delete_photo", "request"),
    ],
)
def test_network_error_is_converted_to_photo_storage_error(monkeypatch, func_name, httpx_func):
    _configure_storage(monkeypatch)
    call = {
        "save_photo": lambda: couple_photo_service.save_photo(b"fake-bytes", "image/jpeg"),
        "get_photo_url": couple_photo_service.get_photo_url,
        "get_photo_bytes": couple_photo_service.get_photo_bytes,
        "delete_photo": couple_photo_service.delete_photo,
    }[func_name]

    with patch(f"app.services.couple_photo_service.httpx.{httpx_func}", side_effect=httpx.ConnectError("boom")):
        with pytest.raises(couple_photo_service.PhotoStorageError):
            call()


def test_get_photo_url_returns_none_on_404(monkeypatch):
    _configure_storage(monkeypatch)
    not_found = httpx.Response(404, request=httpx.Request("HEAD", "https://example.com"))

    with patch("app.services.couple_photo_service.httpx.head", return_value=not_found):
        assert couple_photo_service.get_photo_url() is None


def test_is_not_found_treats_404_and_400_as_not_found_but_not_500():
    resp_404 = httpx.Response(404, request=httpx.Request("GET", "https://example.com"))
    resp_400 = httpx.Response(400, request=httpx.Request("GET", "https://example.com"))
    resp_500 = httpx.Response(500, request=httpx.Request("GET", "https://example.com"))

    assert couple_photo_service._is_not_found(resp_404) is True
    assert couple_photo_service._is_not_found(resp_400) is True
    assert couple_photo_service._is_not_found(resp_500) is False
