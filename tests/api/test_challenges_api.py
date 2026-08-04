from decimal import Decimal


def test_create_and_list_challenge(client):
    resp = client.post(
        "/api/v1/challenges",
        json={
            "title": "외식비 줄이기",
            "description": "이번 달 외식비 30만원 이하로",
            "target_amount": "300000",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "active"
    assert body["effective_status"] == "active"

    list_resp = client.get("/api/v1/challenges")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_update_challenge(client):
    created = client.post(
        "/api/v1/challenges",
        json={
            "title": "외식비 줄이기",
            "target_amount": "300000",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        },
    ).json()

    resp = client.put(
        f"/api/v1/challenges/{created['id']}",
        json={
            "title": "외식비 20만원",
            "target_amount": "200000",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "외식비 20만원"


def test_update_challenge_not_found(client):
    resp = client.put(
        "/api/v1/challenges/999",
        json={"title": "x", "target_amount": "1", "start_date": "2026-08-01", "end_date": "2026-08-31"},
    )
    assert resp.status_code == 404


def test_update_progress_reaching_target_succeeds(client):
    created = client.post(
        "/api/v1/challenges",
        json={
            "title": "외식비 줄이기",
            "target_amount": "300000",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        },
    ).json()

    resp = client.put(f"/api/v1/challenges/{created['id']}/progress", json={"current_amount": "300000"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "succeeded"
    assert Decimal(resp.json()["progress_pct"]) == Decimal("100")


def test_update_progress_not_found(client):
    resp = client.put("/api/v1/challenges/999/progress", json={"current_amount": "1"})
    assert resp.status_code == 404


def test_delete_challenge(client):
    created = client.post(
        "/api/v1/challenges",
        json={
            "title": "외식비 줄이기",
            "target_amount": "300000",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        },
    ).json()

    resp = client.delete(f"/api/v1/challenges/{created['id']}")

    assert resp.status_code == 204
    assert client.get("/api/v1/challenges").json() == []
