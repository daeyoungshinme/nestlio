from decimal import Decimal
from unittest.mock import patch


@patch("app.routers.settings.is_connected", return_value=False)
def test_get_settings_reflects_config(mock_is_connected, client):
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "google_connected" in body
    assert "budget_warn_pct" in body["coaching_thresholds"]


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
def test_set_emergency_fund(mock_is_connected, client):
    resp = client.put("/api/v1/settings/emergency-fund", json={"balance": "3000000"})
    assert resp.status_code == 200
    assert Decimal(resp.json()["emergency_fund_balance"]) == Decimal("3000000")


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
