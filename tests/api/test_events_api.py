from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.models.user import User


def test_create_list_update_delete_event(client, seeded_db):
    create_resp = client.post(
        "/api/v1/events",
        json={
            "title": "병원",
            "start_at": "2026-07-15T10:00:00",
            "frequency": "once",
        },
    )
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]
    assert create_resp.json()["creator"]["id"] == str(seeded_db["user"].id)

    list_resp = client.get("/api/v1/events", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})
    assert list_resp.status_code == 200
    assert any(item["id"] == event_id for item in list_resp.json()["items"])

    update_resp = client.put(
        f"/api/v1/events/{event_id}",
        json={
            "title": "병원 (변경)",
            "start_at": "2026-07-16T11:00:00",
            "frequency": "once",
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "병원 (변경)"

    delete_resp = client.delete(f"/api/v1/events/{event_id}")
    assert delete_resp.status_code == 204

    list_resp2 = client.get("/api/v1/events", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})
    assert all(item["id"] != event_id for item in list_resp2.json()["items"])


def test_update_missing_event_returns_404(client):
    resp = client.put(
        "/api/v1/events/999999",
        json={"title": "없음", "start_at": "2026-07-16T11:00:00", "frequency": "once"},
    )
    assert resp.status_code == 404


def test_delete_missing_event_returns_404(client):
    resp = client.delete("/api/v1/events/999999")
    assert resp.status_code == 404


def test_list_events_includes_recurring_due_in_range(client, seeded_db):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    from app.services import recurring_service

    recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )

    resp = client.get("/api/v1/events", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["recurring_due"]) == 1
    assert body["recurring_due"][0]["name"] == "월세"
    assert body["recurring_due"][0]["next_due_date"] == "2026-07-05"


def test_create_event_with_assignee_and_complete_toggle(client, seeded_db):
    user = seeded_db["user"]
    create_resp = client.post(
        "/api/v1/events",
        json={
            "title": "장보기",
            "start_at": "2026-07-15T10:00:00",
            "frequency": "once",
            "assignee_id": str(user.id),
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["assignee"]["id"] == str(user.id)
    assert body["completed_at"] is None
    event_id = body["id"]

    complete_resp = client.patch(f"/api/v1/events/{event_id}/complete", json={"completed": True})
    assert complete_resp.status_code == 200
    assert complete_resp.json()["completed_at"] is not None

    uncomplete_resp = client.patch(f"/api/v1/events/{event_id}/complete", json={"completed": False})
    assert uncomplete_resp.status_code == 200
    assert uncomplete_resp.json()["completed_at"] is None


def test_complete_missing_event_returns_404(client):
    resp = client.patch("/api/v1/events/999999/complete", json={"completed": True})
    assert resp.status_code == 404


def test_weekly_event_expands_into_multiple_occurrences(client):
    client.post(
        "/api/v1/events",
        json={
            "title": "장보기",
            "start_at": "2026-07-01T09:00:00",
            "frequency": "weekly",
        },
    )

    resp = client.get("/api/v1/events", params={"date_from": "2026-07-01", "date_to": "2026-07-31"})

    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 5


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_event_crud_notifies_other_spouse(mock_connected, mock_send, client, seeded_db):
    db = seeded_db["db"]
    spouse2 = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse2)
    db.commit()

    event_id = client.post(
        "/api/v1/events", json={"title": "여행", "start_at": "2026-08-01T09:00:00", "frequency": "once"}
    ).json()["id"]
    assert client.delete(f"/api/v1/events/{event_id}").status_code == 204

    subjects = [c.args[0] for c in mock_send.call_args_list]
    assert subjects == ["[Nestlio] 새 일정이 등록되었습니다: 여행", "[Nestlio] 일정이 삭제되었습니다: 여행"]
    assert all(c.kwargs["to"] == [spouse2.email] for c in mock_send.call_args_list)
