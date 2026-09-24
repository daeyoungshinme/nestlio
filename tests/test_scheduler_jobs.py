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

    jobs.daily_due_date_check()  # Google 미연결 → 캘린더 동기화만 건너뛰고 성공해야 한다

    db.expire_all()
    posted = db.query(Transaction).filter(Transaction.recurring_expense_id.isnot(None)).all()
    assert [(t.description, t.transaction_date) for t in posted] == [("월세", date(2026, 7, 5))]


def test_safety_net_rolls_back_failed_step_and_runs_the_rest(seeded_db, monkeypatch):
    ran: list[str] = []

    def poison_session(db):
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

    with pytest.raises(RuntimeError, match="예산 초과 체크") as exc_info:
        jobs.daily_threshold_safety_net()

    assert ran == ["later", "later"]
    assert "목표 달성 체크" not in str(exc_info.value)
