from unittest.mock import patch

import pytest

from app.services import coaching_settings_service


@patch("app.services.settings_service.is_connected", return_value=False)
def test_get_settings_reflects_config(mock_is_connected, client):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "google_connected" in body
    assert "budget_warn_pct" in body["coaching_thresholds"]


@patch("app.services.settings_service.is_connected", return_value=False)
def test_get_settings_defaults_notify_emails_to_signup_email(mock_is_connected, client, seeded_db):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == [seeded_db["user"].email]


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_notify_emails_overrides_and_persists(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["a@example.com", "b@example.com"]})
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == ["a@example.com", "b@example.com"]

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["notify_emails"] == ["a@example.com", "b@example.com"]


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_notify_emails_rejects_empty_list(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": []})
    assert resp.status_code == 422


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_notify_emails_rejects_invalid_format(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["not-an-email"]})
    assert resp.status_code == 422


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_notify_emails_normalizes_case_and_dedupes(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["A@example.com", " a@example.com "]})
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == ["a@example.com"]


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_coaching_thresholds_overrides_and_persists(mock_is_connected, client):
    payload = {
        "savings_rate_warn": 25,
        "savings_rate_critical": 15,
        "fixed_cost_ratio_warn": 45,
        "fixed_cost_ratio_critical": 55,
        "budget_warn_pct": 85,
        "budget_critical_pct": 95,
        "discretionary_ratio_warn": 20,
        "debt_ratio_warn": 35,
        "benchmark_food_warn_pct": 16,
        "benchmark_housing_warn_pct": 29,
        "benchmark_communication_warn_pct": 6,
        "benchmark_transport_warn_pct": 11,
        "benchmark_leisure_warn_pct": 11,
        "benchmark_healthcare_warn_pct": 7,
        "benchmark_education_warn_pct": 11,
        "benchmark_insurance_warn_pct": 9,
    }
    resp = client.put("/api/v1/settings/coaching-thresholds", json=payload)
    assert resp.status_code == 200
    assert resp.json()["coaching_thresholds"] == payload

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["coaching_thresholds"] == payload


def _thresholds(**overrides):
    """env 기본값(유효한 조합)에서 일부만 바꾼 임계값 payload."""
    defaults = {name: getattr(coaching_settings_service.settings, name) for name in coaching_settings_service.THRESHOLD_FIELDS}
    return {**defaults, **overrides}


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"budget_critical_pct": 150}, None),  # 0-100 범위 밖
        ({"savings_rate_warn": 10, "savings_rate_critical": 20}, "저축률"),  # 낮을수록 나쁨: warn > critical
        ({"budget_warn_pct": 100, "budget_critical_pct": 90}, "예산"),  # 높을수록 나쁨: warn < critical
        ({"fixed_cost_ratio_warn": 50, "fixed_cost_ratio_critical": 50}, "고정비율"),
    ],
)
@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_coaching_thresholds_rejects_out_of_range_or_inverted_pairs(mock_is_connected, client, overrides, message):
    resp = client.put("/api/v1/settings/coaching-thresholds", json=_thresholds(**overrides))
    assert resp.status_code == 422
    if message:
        assert message in str(resp.json()["detail"])


@patch("app.services.notification_service.is_connected", return_value=False)
def test_test_weekly_email_without_google_returns_409(mock_is_connected, client):
    # google_oauth_tokens에 행이 없는 (Google 미연결) 상태 - GoogleNotConnectedError -> 409
    resp = client.post("/api/v1/settings/test-weekly-email")
    assert resp.status_code == 409


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
def test_test_weekly_email_sends_when_connected(mock_send_email, mock_service_connected, client):
    resp = client.post("/api/v1/settings/test-weekly-email")
    assert resp.status_code == 200
    assert resp.json()["sent"] is True
    mock_send_email.assert_called_once()


@patch("app.services.settings_service.is_connected", return_value=False)
def test_get_settings_notification_prefs_default_all_on(mock_is_connected, client):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert all(resp.json()["notification_prefs"].values())


@patch("app.services.settings_service.is_connected", return_value=False)
def test_set_notification_prefs_overrides_and_persists(mock_is_connected, client):
    payload = {
        "email_weekly": False,
        "email_monthly": True,
        "threshold_alert": True,
        "goal_milestone": True,
        "challenge_success": True,
        "event_reminder": True,
        "savings_pace_reminder": False,
        "partner_saving": False,
    }
    resp = client.put("/api/v1/settings/notification-prefs", json=payload)
    assert resp.status_code == 200
    assert resp.json()["notification_prefs"] == payload

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["notification_prefs"] == payload


@patch("app.services.notification_service.is_connected", return_value=True)
def test_test_weekly_email_returns_409_when_pref_disabled(mock_is_connected, client):
    client.put(
        "/api/v1/settings/notification-prefs",
        json={
            "email_weekly": False,
            "email_monthly": True,
            "threshold_alert": True,
            "goal_milestone": True,
            "challenge_success": True,
            "event_reminder": True,
        },
    )
    resp = client.post("/api/v1/settings/test-weekly-email")
    assert resp.status_code == 409


@patch("app.services.settings_service.is_connected", return_value=False)
def test_get_settings_survives_photo_storage_outage(mock_is_connected, client):
    """사진 스토리지 장애(네트워크·5xx)가 설정 화면 전체를 500으로 만들지 않고 "사진 없음"으로 내려간다."""
    from app.services import couple_photo_service

    with patch.object(
        couple_photo_service, "get_photo_url", side_effect=couple_photo_service.PhotoStorageError("down")
    ):
        resp = client.get("/api/v1/settings")
        bootstrap = client.get("/api/v1/dashboard/bootstrap")

    assert resp.status_code == 200
    assert resp.json()["couple_photo_url"] is None
    assert bootstrap.status_code == 200
    assert bootstrap.json()["settings"]["couple_photo_url"] is None


def test_versioned_couple_photo_is_cacheable(client):
    """사진 URL은 버전(?v=)이 바뀔 때만 바뀌므로 버전 붙은 요청만 오래 캐시한다."""
    from app.services import couple_photo_service

    with patch.object(couple_photo_service, "get_photo_bytes", return_value=(b"img", "image/jpeg")):
        versioned = client.get("/media/couple-photo?v=20261015090000")
        bare = client.get("/media/couple-photo")

    assert versioned.status_code == 200
    assert "immutable" in versioned.headers["cache-control"]
    assert "immutable" not in bare.headers.get("cache-control", "")


@patch("app.services.settings_service.is_connected", return_value=False)
def test_insurance_targets_default_and_update(mock_is_connected, client):
    from decimal import Decimal

    targets = client.get("/api/v1/settings").json()["insurance_targets"]
    assert Decimal(targets["cancer"]) == Decimal("30000000")

    payload = {**{k: str(v) for k, v in targets.items()}, "cancer": "50000000", "death": "0"}
    resp = client.put("/api/v1/settings/insurance-targets", json=payload)
    assert resp.status_code == 200
    assert Decimal(resp.json()["insurance_targets"]["cancer"]) == Decimal("50000000")
    assert Decimal(resp.json()["insurance_targets"]["death"]) == Decimal("0")

    assert client.put("/api/v1/settings/insurance-targets", json={**payload, "cancer": "-1"}).status_code == 422


def test_insurance_targets_fall_back_on_corrupt_value(seeded_db):
    from decimal import Decimal

    from app.services import insurance_target_service, user_setting_service

    db, user = seeded_db["db"], seeded_db["user"]
    user_setting_service.set_shared_setting(db, "insurance_target_heart", "abc", user.id)
    assert insurance_target_service.get_targets(db)["heart"] == Decimal("20000000")
