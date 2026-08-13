from unittest.mock import patch


@patch("app.routers.settings.is_connected", return_value=False)
def test_get_settings_reflects_config(mock_is_connected, client):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "google_connected" in body
    assert "budget_warn_pct" in body["coaching_thresholds"]


@patch("app.routers.settings.is_connected", return_value=False)
def test_get_settings_defaults_notify_emails_to_signup_email(mock_is_connected, client, seeded_db):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == [seeded_db["user"].email]


@patch("app.routers.settings.is_connected", return_value=False)
def test_set_notify_emails_overrides_and_persists(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["a@example.com", "b@example.com"]})
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == ["a@example.com", "b@example.com"]

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["notify_emails"] == ["a@example.com", "b@example.com"]


@patch("app.routers.settings.is_connected", return_value=False)
def test_set_notify_emails_rejects_empty_list(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": []})
    assert resp.status_code == 422


@patch("app.routers.settings.is_connected", return_value=False)
def test_set_notify_emails_rejects_invalid_format(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["not-an-email"]})
    assert resp.status_code == 422


@patch("app.routers.settings.is_connected", return_value=False)
def test_set_notify_emails_normalizes_case_and_dedupes(mock_is_connected, client):
    resp = client.put("/api/v1/settings/notify-emails", json={"emails": ["A@example.com", " a@example.com "]})
    assert resp.status_code == 200
    assert resp.json()["notify_emails"] == ["a@example.com"]


@patch("app.routers.settings.is_connected", return_value=False)
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
    }
    resp = client.put("/api/v1/settings/coaching-thresholds", json=payload)
    assert resp.status_code == 200
    assert resp.json()["coaching_thresholds"] == payload

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["coaching_thresholds"] == payload


@patch("app.routers.settings.is_connected", return_value=False)
def test_test_weekly_email_without_google_returns_409(mock_is_connected, client):
    # google_oauth_tokens에 행이 없는 (Google 미연결) 상태 - GoogleNotConnectedError -> 409
    resp = client.post("/api/v1/settings/test-weekly-email")
    assert resp.status_code == 409


@patch("app.services.notification_service.is_connected", return_value=True)
@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.routers.settings.is_connected", return_value=True)
def test_test_weekly_email_sends_when_connected(mock_is_connected, mock_send_email, mock_service_connected, client):
    resp = client.post("/api/v1/settings/test-weekly-email")
    assert resp.status_code == 200
    assert resp.json()["sent"] is True
    mock_send_email.assert_called_once()


@patch("app.routers.settings.is_connected", return_value=False)
def test_get_settings_notification_prefs_default_all_on(mock_is_connected, client):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert all(resp.json()["notification_prefs"].values())


@patch("app.routers.settings.is_connected", return_value=False)
def test_set_notification_prefs_overrides_and_persists(mock_is_connected, client):
    payload = {
        "email_weekly": False,
        "email_monthly": True,
        "threshold_alert": True,
        "goal_milestone": True,
        "challenge_success": True,
        "event_reminder": True,
    }
    resp = client.put("/api/v1/settings/notification-prefs", json=payload)
    assert resp.status_code == 200
    assert resp.json()["notification_prefs"] == payload

    # persists across a fresh GET
    assert client.get("/api/v1/settings").json()["notification_prefs"] == payload


@patch("app.routers.settings.is_connected", return_value=True)
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
