"""SPA 서빙(app/spa.py) — dist 경로를 주입해 빌드 산출물 없이도 catch-all 동작을 확인한다."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import mount_spa


def _client(tmp_path) -> TestClient:
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    app = FastAPI()
    mount_spa(app, tmp_path)
    return TestClient(app)


def test_client_routes_fall_back_to_index_and_files_are_served(tmp_path):
    client = _client(tmp_path)
    assert client.get("/goals/3").text == "<html>spa</html>"
    assert client.get("/favicon.svg").text == "<svg/>"
    assert client.get("/assets/app.js").text == "console.log(1)"


def test_api_namespaces_are_404_not_index(tmp_path):
    client = _client(tmp_path)
    assert client.get("/api/v1/nope").status_code == 404
    assert client.get("/internal/jobs/nope").status_code == 404


def test_path_outside_dist_is_not_served(tmp_path):
    (tmp_path.parent / "secret.txt").write_text("secret", encoding="utf-8")
    client = _client(tmp_path)
    assert "secret" not in client.get("/..%2Fsecret.txt").text


def test_missing_dist_mounts_nothing(tmp_path):
    app = FastAPI()
    mount_spa(app, tmp_path / "missing")
    assert TestClient(app).get("/").status_code == 404
