def test_create_and_list_goal(client, seeded_db):
    resp = client.post(
        "/api/v1/financial-goals",
        json={"priority": 1, "name": "내집마련", "required_amount": "100000000", "monthly_saving_amount": "500000"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "goal"
    assert body["name"] == "내집마련"

    list_resp = client.get("/api/v1/financial-goals")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_update_goal_not_found(client, seeded_db):
    resp = client.put(
        "/api/v1/financial-goals/999",
        json={"priority": 1, "name": "x", "target_age": None, "required_amount": "1", "monthly_saving_amount": "0"},
    )
    assert resp.status_code == 404


def test_create_and_list_challenge(client, seeded_db):
    resp = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "challenge",
            "name": "외식비 줄이기",
            "description": "이번 달 외식비 30만원 이하로",
            "required_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "challenge"
    assert body["status"] == "active"
    assert body["effective_status"] == "active"

    list_resp = client.get("/api/v1/financial-goals")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_update_challenge_progress_reaching_target_succeeds(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "challenge",
            "name": "외식비 줄이기",
            "required_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    ).json()

    resp = client.put(
        f"/api/v1/financial-goals/{created['id']}",
        json={
            "priority": 1,
            "name": "외식비 줄이기",
            "target_age": None,
            "required_amount": "300000",
            "monthly_saving_amount": "0",
            "current_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "succeeded"
    assert body["progress_pct"] == "100"


def test_delete_goal(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={"priority": 1, "name": "여행자금", "required_amount": "5000000", "monthly_saving_amount": "200000"},
    ).json()

    resp = client.delete(f"/api/v1/financial-goals/{created['id']}")

    assert resp.status_code == 204
    assert client.get("/api/v1/financial-goals").json() == []
