def test_healthz_round_trips_the_database(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_healthz_is_not_in_openapi(client):
    assert "/healthz" not in client.get("/openapi.json").json()["paths"]
