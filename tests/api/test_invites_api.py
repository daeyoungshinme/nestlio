import uuid
from unittest.mock import patch


@patch("app.services.invite_service.is_connected", return_value=False)
def test_create_and_list_invite(mock_connected, client):
    resp = client.post("/api/v1/invites", json={"email": "spouse2@example.com"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "spouse2@example.com"
    assert body["accepted_at"] is None
    assert "accept_url" in body

    resp = client.get("/api/v1/invites")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@patch("app.services.invite_service.is_connected", return_value=False)
def test_household_full_returns_409(mock_connected, client):
    create_resp = client.post("/api/v1/invites", json={"email": "spouse2@example.com"})
    token = create_resp.json()["accept_url"].split("token=")[1]
    client.post(f"/api/v1/invites/token/{token}/accept", json={"user_id": str(uuid.uuid4()), "display_name": "배우자"})

    resp = client.post("/api/v1/invites", json={"email": "third@example.com"})
    assert resp.status_code == 409


@patch("app.services.invite_service.is_connected", return_value=False)
def test_validate_and_accept_invite_token_is_public(mock_connected, client):
    # 초대 생성은 인증된 client 픽스처로 하되, 토큰 검증/수락은 인증 없이도 접근 가능해야 한다.
    create_resp = client.post("/api/v1/invites", json={"email": "spouse2@example.com"})
    token = create_resp.json()["accept_url"].split("token=")[1]

    resp = client.get(f"/api/v1/invites/token/{token}")
    assert resp.status_code == 200
    assert resp.json()["email"] == "spouse2@example.com"

    new_user_id = str(uuid.uuid4())
    resp = client.post(
        f"/api/v1/invites/token/{token}/accept",
        json={"user_id": new_user_id, "display_name": "배우자"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == new_user_id
    assert resp.json()["display_name"] == "배우자"


def test_validate_unknown_token_returns_404(client):
    resp = client.get("/api/v1/invites/token/does-not-exist")
    assert resp.status_code == 404


@patch("app.services.invite_service.is_connected", return_value=False)
def test_cancel_invite(mock_connected, client):
    create_resp = client.post("/api/v1/invites", json={"email": "spouse2@example.com"})
    invite_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/invites/{invite_id}")
    assert resp.status_code == 204
    assert client.get("/api/v1/invites").json() == []
