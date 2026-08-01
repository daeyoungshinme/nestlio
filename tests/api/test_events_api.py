from datetime import date
from decimal import Decimal


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
