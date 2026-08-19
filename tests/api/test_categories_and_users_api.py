from app.models.user import User


def test_list_categories(client):
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()}
    assert {"식비", "주거비"} <= names


def test_create_category(client):
    resp = client.post(
        "/api/v1/categories", json={"name": "경조사비", "kind": "expense", "type": "irregular", "color": "#e11d48"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "경조사비"
    assert body["type"] == "irregular"

    list_resp = client.get("/api/v1/categories")
    names = {c["name"] for c in list_resp.json()}
    assert "경조사비" in names


def test_update_category(client):
    create_resp = client.post(
        "/api/v1/categories", json={"name": "휴가비", "kind": "expense", "type": "irregular", "color": "#f43f5e"}
    )
    category_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/v1/categories/{category_id}",
        json={"name": "여행비", "kind": "expense", "type": "irregular", "color": "#fb7185"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "여행비"
    assert body["color"] == "#fb7185"


def test_create_category_with_benchmark_group(client):
    resp = client.post(
        "/api/v1/categories",
        json={"name": "배달음식", "kind": "expense", "type": "variable", "color": "#f97316", "benchmark_group": "food"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["benchmark_group"] == "food"

    update_resp = client.put(
        f"/api/v1/categories/{body['id']}",
        json={"name": "배달음식", "kind": "expense", "type": "variable", "color": "#f97316", "benchmark_group": None},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["benchmark_group"] is None


def test_create_category_rejects_unknown_benchmark_group(client):
    resp = client.post(
        "/api/v1/categories",
        json={"name": "잡비", "kind": "expense", "type": "variable", "color": "#000000", "benchmark_group": "not_a_group"},
    )
    assert resp.status_code == 422


def test_update_category_not_found(client):
    resp = client.put(
        "/api/v1/categories/999999",
        json={"name": "존재안함", "kind": "expense", "type": "irregular", "color": "#000000"},
    )
    assert resp.status_code == 404


def test_deactivate_category_excludes_it_from_list(client):
    create_resp = client.post(
        "/api/v1/categories", json={"name": "명절비", "kind": "expense", "type": "irregular", "color": "#e11d48"}
    )
    category_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/categories/{category_id}/deactivate")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/categories")
    assert all(c["id"] != category_id for c in list_resp.json())


def test_get_current_user_profile(client, seeded_db):
    user = seeded_db["user"]
    resp = client.get("/api/v1/users/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_list_users(client, seeded_db):
    user = seeded_db["user"]
    resp = client.get("/api/v1/users")
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert user.email in emails


def test_update_my_display_name(client, seeded_db):
    resp = client.put("/api/v1/users/me", json={"display_name": "남편"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "남편"

    me_resp = client.get("/api/v1/users/me")
    assert me_resp.json()["display_name"] == "남편"


def test_update_my_display_name_rejects_blank(client, seeded_db):
    resp = client.put("/api/v1/users/me", json={"display_name": ""})
    assert resp.status_code == 422


def test_update_other_users_display_name(client, seeded_db):
    db = seeded_db["db"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)

    resp = client.put(f"/api/v1/users/{spouse.id}", json={"display_name": "아내"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "아내"

    list_resp = client.get("/api/v1/users")
    names = {u["display_name"] for u in list_resp.json()}
    assert "아내" in names


def test_update_user_not_found(client, seeded_db):
    resp = client.put(
        "/api/v1/users/00000000-0000-0000-0000-000000000000", json={"display_name": "누구"}
    )
    assert resp.status_code == 404


def test_remove_spouse(client, seeded_db):
    db = seeded_db["db"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)

    resp = client.delete(f"/api/v1/users/{spouse.id}")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/users")
    ids = {u["id"] for u in list_resp.json()}
    assert str(spouse.id) not in ids


def test_remove_self_rejected(client, seeded_db):
    user = seeded_db["user"]
    resp = client.delete(f"/api/v1/users/{user.id}")
    assert resp.status_code == 400

    list_resp = client.get("/api/v1/users")
    ids = {u["id"] for u in list_resp.json()}
    assert str(user.id) in ids


def test_remove_user_not_found(client, seeded_db):
    resp = client.delete("/api/v1/users/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_remove_already_removed_user_returns_404(client, seeded_db):
    db = seeded_db["db"]
    spouse = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(spouse)
    db.commit()
    db.refresh(spouse)

    first = client.delete(f"/api/v1/users/{spouse.id}")
    assert first.status_code == 204

    second = client.delete(f"/api/v1/users/{spouse.id}")
    assert second.status_code == 404
