from datetime import date
from unittest.mock import patch


@patch("app.services.notification_service.gmail_service.send_email")
def test_list_notifications(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))

    resp = client.get("/api/v1/notifications")
    assert resp.status_code == 200
    body = resp.json()
    assert body["unread_count"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["is_read"] is False
    assert body["items"][0]["notif_type"] == "email_weekly"


@patch("app.services.notification_service.gmail_service.send_email")
def test_mark_read(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))
    log_id = client.get("/api/v1/notifications").json()["items"][0]["id"]

    resp = client.post(f"/api/v1/notifications/{log_id}/read")
    assert resp.status_code == 204

    body = client.get("/api/v1/notifications").json()
    assert body["unread_count"] == 0
    assert body["items"][0]["is_read"] is True


def test_mark_read_unknown_id_returns_404(client):
    resp = client.post("/api/v1/notifications/999999/read")
    assert resp.status_code == 404


@patch("app.services.notification_service.gmail_service.send_email")
def test_mark_all_read(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))
    notification_service.send_monthly_summary(seeded_db["db"], today=date(2026, 8, 3))

    resp = client.post("/api/v1/notifications/read-all")
    assert resp.status_code == 200
    assert resp.json()["marked"] == 2

    assert client.get("/api/v1/notifications").json()["unread_count"] == 0


@patch("app.services.notification_service.gmail_service.send_email")
def test_react_to_notification(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))
    log_id = client.get("/api/v1/notifications").json()["items"][0]["id"]

    resp = client.put(f"/api/v1/notifications/{log_id}/reaction", json={"emoji": "🎉", "message": "축하해요"})
    assert resp.status_code == 204

    body = client.get("/api/v1/notifications").json()
    [reaction] = body["items"][0]["reactions"]
    assert reaction["emoji"] == "🎉"
    assert reaction["message"] == "축하해요"


@patch("app.services.notification_service.gmail_service.send_email")
def test_react_to_notification_rejects_unknown_emoji(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))
    log_id = client.get("/api/v1/notifications").json()["items"][0]["id"]

    resp = client.put(f"/api/v1/notifications/{log_id}/reaction", json={"emoji": "😈"})
    assert resp.status_code == 422


def test_react_to_unknown_notification_returns_404(client):
    resp = client.put("/api/v1/notifications/999999/reaction", json={"emoji": "🎉"})
    assert resp.status_code == 404


@patch("app.services.notification_service.gmail_service.send_email")
def test_remove_reaction(mock_send, client, seeded_db):
    from app.services import notification_service

    notification_service.send_weekly_summary(seeded_db["db"], today=date(2026, 7, 29))
    log_id = client.get("/api/v1/notifications").json()["items"][0]["id"]
    client.put(f"/api/v1/notifications/{log_id}/reaction", json={"emoji": "🎉"})

    resp = client.delete(f"/api/v1/notifications/{log_id}/reaction")
    assert resp.status_code == 204

    body = client.get("/api/v1/notifications").json()
    assert body["items"][0]["reactions"] == []
