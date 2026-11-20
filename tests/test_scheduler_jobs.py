"""app/scheduler/jobs.py의 실제 잡 본문 테스트 — tests/api/test_internal_jobs_api.py는 JOB_REGISTRY를
스텁으로 바꿔 인증/라우팅만 검증하므로, 여기서는 잡 함수를 직접 호출해 래퍼(_job)의 예외 전파와
안전망 잡의 단계별 에러 누적/롤백을 검증한다. 잡의 SessionLocal()은 conftest가 테스트 DB로 돌린다."""

from datetime import date
from decimal import Decimal

import pytest

from app.models.notification_log import NotificationLog
from app.models.transaction import Transaction
from app.scheduler import jobs
from app.services import recurring_service


def test_job_wrapper_reraises_so_github_actions_marks_failure():
    @jobs._job("테스트 잡 실패")
    def failing_job(db):
        raise ValueError("boom")

    with pytest.raises(ValueError, match="boom"):
        failing_job()


def test_daily_due_date_check_posts_due_recurring_without_google(seeded_db, monkeypatch):
    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    recurring_service.create_recurring(
        db, name="월세", category_id=rent.id, amount=Decimal("800000"),
        frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
    )
    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 7, 5))

    jobs.daily_due_date_check()  # Google 미연결이어도 반복거래 자동 기록은 성공해야 한다
    jobs.daily_due_date_check()  # 같은 날 다시 돌아도(Actions 재실행·수동 실행) 한 번만 기록

    db.expire_all()
    posted = db.query(Transaction).filter(Transaction.recurring_expense_id.isnot(None)).all()
    assert [(t.description, t.transaction_date) for t in posted] == [("월세", date(2026, 7, 5))]


def test_safety_net_rolls_back_failed_step_and_runs_the_rest(seeded_db, monkeypatch):
    ran: list[str] = []

    def poison_session(db, **_kwargs):
        # notif_type NOT NULL 위반 → flush 실패. 롤백하지 않으면 다음 단계가 PendingRollbackError.
        db.add(NotificationLog(notif_type=None))
        db.flush()

    def later_step(db, **_kwargs):
        db.query(NotificationLog).count()
        ran.append("later")
        return []

    monkeypatch.setattr(jobs.notification_service, "check_all_categories_threshold", poison_session)
    monkeypatch.setattr(jobs.goal_service, "sync_challenge_statuses", later_step)
    monkeypatch.setattr(jobs.notification_service, "check_all_goal_milestones", later_step)
    # 4번째 단계도 막아 둔다 — 안 막으면 실제 today_kst()로 돌아 말일 3일간만 결과가 달라진다.
    monkeypatch.setattr(jobs.notification_service, "check_savings_pace_reminder", later_step)

    with pytest.raises(RuntimeError, match="예산 초과 체크") as exc_info:
        jobs.daily_threshold_safety_net()

    assert ran == ["later", "later", "later"]
    assert "목표 달성 체크" not in str(exc_info.value)


def test_safety_net_runs_savings_pace_reminder_with_kst_today(seeded_db, monkeypatch):
    seen: list[date] = []
    noop = lambda db, **_kwargs: []  # noqa: E731
    monkeypatch.setattr(jobs.notification_service, "check_all_categories_threshold", noop)
    monkeypatch.setattr(jobs.goal_service, "sync_challenge_statuses", noop)
    monkeypatch.setattr(jobs.notification_service, "check_all_goal_milestones", noop)
    monkeypatch.setattr(
        jobs.notification_service, "check_savings_pace_reminder", lambda db, today: seen.append(today)
    )
    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 9, 28))

    jobs.daily_threshold_safety_net()

    assert seen == [date(2026, 9, 28)]


def test_safety_net_injects_kst_today_into_every_dated_step(seeded_db, monkeypatch):
    seen: dict[str, object] = {}
    monkeypatch.setattr(
        jobs.notification_service, "check_all_categories_threshold", lambda db, year_month: seen.update(ym=year_month)
    )
    monkeypatch.setattr(jobs.goal_service, "sync_challenge_statuses", lambda db, now: None)
    monkeypatch.setattr(jobs.notification_service, "check_all_goal_milestones", lambda db, today: seen.update(goal=today))
    monkeypatch.setattr(jobs.notification_service, "check_savings_pace_reminder", lambda db, today: None)
    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 9, 28))

    jobs.daily_threshold_safety_net()

    assert seen == {"ym": "2026-09", "goal": date(2026, 9, 28)}


def test_daily_due_date_check_fails_job_when_an_item_fails(seeded_db, monkeypatch):
    """한 항목 실패가 나머지를 막지는 않지만 잡은 실패로 끝난다 — 로그만 남기고 "ok"면 매일 같은 항목이
    실패해도 GitHub Actions가 초록불이다."""
    from unittest.mock import patch

    from app.errors import PartialFailureError

    db, user, rent = seeded_db["db"], seeded_db["user"], seeded_db["rent"]
    for name in ("월세", "관리비"):
        recurring_service.create_recurring(
            db, name=name, category_id=rent.id, amount=Decimal("100"),
            frequency="monthly", start_date=date(2026, 7, 5), created_by=user.id,
        )
    real_create = recurring_service.create_transaction

    def fail_one(db_, **kwargs):
        if kwargs["description"] == "관리비":
            raise RuntimeError("boom")
        return real_create(db_, **kwargs)

    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 7, 5))
    with patch("app.services.recurring_service.create_transaction", side_effect=fail_one), pytest.raises(PartialFailureError):
        jobs.daily_due_date_check()

    db.expire_all()
    assert [t.description for t in db.query(Transaction).all()] == ["월세"]


def test_event_reminder_check_logs_in_app_without_google(seeded_db, monkeypatch):
    """Gmail 미연결이어도 잡이 돈다 — 인앱 리마인더는 남고 메일만 건너뛴다."""
    from datetime import datetime

    from app.services import event_service

    db, user = seeded_db["db"], seeded_db["user"]
    event_service.create_event(
        db, created_by=user.id, title="병원", start_at=datetime(2026, 7, 15, 10, 0), reminder_minutes_before=60
    )
    monkeypatch.setattr(jobs, "now_kst", lambda: datetime(2026, 7, 15, 9, 0))

    jobs.event_reminder_check()
    jobs.event_reminder_check()  # 15분 틱이 겹쳐도 같은 리마인더는 한 번

    db.expire_all()
    assert db.query(NotificationLog).filter(NotificationLog.notif_type == "event_reminder").count() == 1


@pytest.mark.parametrize(
    "job_name,today,notif_type",
    [
        ("weekly_summary_email", date(2026, 7, 13), "email_weekly"),  # 월요일
        ("monthly_summary_email", date(2026, 8, 1), "email_monthly"),
    ],
)
def test_summary_email_jobs_log_in_app_once_without_google(seeded_db, monkeypatch, job_name, today, notif_type):
    """Gmail 미연결이어도 요약은 인앱 알림함에 남고, 같은 기간에 다시 돌면(curl 재시도·수동 실행) 중복으로 남지 않는다."""
    db = seeded_db["db"]
    monkeypatch.setattr(jobs, "today_kst", lambda: today)
    job = getattr(jobs, job_name)

    job()
    job()

    db.expire_all()
    assert db.query(NotificationLog).filter(NotificationLog.notif_type == notif_type).count() == 1


def test_summary_email_job_passes_kst_today(seeded_db, monkeypatch):
    seen: list[date] = []
    monkeypatch.setattr(jobs.notification_service, "send_weekly_summary", lambda db, today: seen.append(today))
    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 7, 13))

    jobs.weekly_summary_email()

    assert seen == [date(2026, 7, 13)]


def test_monthly_net_worth_snapshot_upserts_one_row_per_month(seeded_db, monkeypatch):
    from app.models.net_worth_snapshot import NetWorthSnapshot
    from app.services import savings_product_service

    db = seeded_db["db"]
    savings_product_service.create_product(db, "적금", Decimal("1000000"), Decimal("0"), "savings")
    monkeypatch.setattr(jobs, "today_kst", lambda: date(2026, 8, 1))

    jobs.monthly_net_worth_snapshot()
    savings_product_service.create_product(db, "펀드", Decimal("500000"), Decimal("0"), "investment")
    jobs.monthly_net_worth_snapshot()  # 같은 달 재실행은 새 행이 아니라 갱신

    db.expire_all()
    [snapshot] = db.query(NetWorthSnapshot).all()
    assert (snapshot.year_month, snapshot.snapshot_date) == ("2026-08", date(2026, 8, 1))
    assert snapshot.savings_total == Decimal("1500000")
