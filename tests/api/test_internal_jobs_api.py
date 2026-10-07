from app.routers import internal_jobs


def test_missing_secret_returns_401(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")
    resp = client.post("/internal/jobs/daily-due-date-check")
    assert resp.status_code == 401


def test_wrong_secret_returns_401(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")
    resp = client.post(
        "/internal/jobs/daily-due-date-check", headers={"X-Internal-Job-Secret": "wrong"}
    )
    assert resp.status_code == 401


def test_unconfigured_secret_fails_closed(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "")
    resp = client.post(
        "/internal/jobs/daily-due-date-check", headers={"X-Internal-Job-Secret": ""}
    )
    assert resp.status_code == 401


def test_unknown_job_name_returns_404(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")
    resp = client.post(
        "/internal/jobs/not-a-real-job", headers={"X-Internal-Job-Secret": "test-secret"}
    )
    assert resp.status_code == 404


def test_correct_secret_runs_registered_job(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")
    calls = []
    monkeypatch.setitem(internal_jobs.JOB_REGISTRY, "daily-due-date-check", lambda: calls.append(1))

    resp = client.post(
        "/internal/jobs/daily-due-date-check", headers={"X-Internal-Job-Secret": "test-secret"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"job": "daily-due-date-check", "status": "ok"}
    assert calls == [1]


def test_failed_job_reports_exception_class_in_detail(client, monkeypatch):
    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")

    def boom():
        raise KeyError("secret-ish detail")

    monkeypatch.setitem(internal_jobs.JOB_REGISTRY, "daily-due-date-check", boom)

    resp = client.post(
        "/internal/jobs/daily-due-date-check", headers={"X-Internal-Job-Secret": "test-secret"}
    )
    assert resp.status_code == 500
    assert resp.json()["detail"] == "job 'daily-due-date-check' failed: KeyError"


def test_overlapping_run_of_same_job_is_skipped_not_rerun(client, monkeypatch):
    # curl 재시도가 아직 도는 첫 실행과 겹치면 잡을 다시 돌리지 않고 200 skipped.
    from contextlib import contextmanager

    monkeypatch.setattr("app.routers.internal_jobs.settings.internal_job_secret", "test-secret")
    calls = []
    monkeypatch.setitem(internal_jobs.JOB_REGISTRY, "daily-due-date-check", lambda: calls.append(1))

    @contextmanager
    def _held(_job_name):
        yield False

    monkeypatch.setattr(internal_jobs, "job_lock", _held)
    resp = client.post(
        "/internal/jobs/daily-due-date-check", headers={"X-Internal-Job-Secret": "test-secret"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"job": "daily-due-date-check", "status": "skipped"}
    assert calls == []
