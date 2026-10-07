from unittest.mock import MagicMock

import pytest

from app.scheduler import job_lock as job_lock_module
from app.scheduler.job_lock import job_lock, lock_keys


def test_lock_keys_are_stable_signed_int4_and_distinct_per_job():
    ns, weekly = lock_keys("weekly-summary-email")
    assert lock_keys("weekly-summary-email") == (ns, weekly)  # hash()와 달리 실행마다 같아야 한다
    assert lock_keys("monthly-summary-email")[1] != weekly
    for value in (ns, weekly):
        assert -(2**31) <= value < 2**31


def test_non_postgres_engine_always_acquires(db_session):
    with job_lock("daily-due-date-check", engine=db_session.get_bind()) as acquired:
        assert acquired is True


def _pg_engine(try_lock_result: bool):
    engine = MagicMock()
    engine.dialect.name = "postgresql"
    conn = engine.connect.return_value.__enter__.return_value
    conn.execute.return_value.scalar.return_value = try_lock_result
    return engine, conn


def test_postgres_lock_is_released_after_job_even_if_job_raises():
    engine, conn = _pg_engine(True)
    with pytest.raises(RuntimeError), job_lock("event-reminder-check", engine=engine) as acquired:
        assert acquired is True
        raise RuntimeError("job failed")
    sql = [str(call.args[0]) for call in conn.execute.call_args_list]
    assert "pg_try_advisory_lock" in sql[0]
    assert "pg_advisory_unlock" in sql[-1]


def test_postgres_lock_held_elsewhere_yields_false_without_unlocking():
    engine, conn = _pg_engine(False)
    with job_lock("event-reminder-check", engine=engine) as acquired:
        assert acquired is False
    sql = [str(call.args[0]) for call in conn.execute.call_args_list]
    assert not any("pg_advisory_unlock" in s for s in sql)


def test_failed_unlock_invalidates_connection(monkeypatch):
    engine, conn = _pg_engine(True)
    results = iter([MagicMock(scalar=MagicMock(return_value=True))])

    def _execute(stmt):
        if "pg_advisory_unlock" in str(stmt):
            raise RuntimeError("connection lost")
        return next(results)

    conn.execute.side_effect = _execute
    monkeypatch.setattr(job_lock_module.logger, "exception", MagicMock())
    with job_lock("event-reminder-check", engine=engine):
        pass
    conn.invalidate.assert_called_once()
