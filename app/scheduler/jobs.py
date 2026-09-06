import logging

from app.database import SessionLocal
from app.services import event_service, goal_service, net_worth_service, notification_service, recurring_service
from app.services.google_auth import GoogleNotConnectedError, is_connected
from app.utils.dates import now_kst, today_kst

logger = logging.getLogger("scheduler")


def daily_due_date_check() -> None:
    """Post transactions for any recurring expense whose due date has arrived,
    and sync upcoming reminder events to Google Calendar (if connected)."""
    db = SessionLocal()
    try:
        recurring_service.generate_due_transactions(db, today=today_kst())
        _sync_upcoming_calendar_events(db)
    except Exception:
        logger.exception("고정지출 거래 생성/캘린더 동기화 실패")
        raise
    finally:
        db.close()


def _sync_upcoming_calendar_events(db) -> None:
    if not is_connected():
        logger.info("Google 계정 미연결 - 캘린더 동기화 건너뜀")
        return
    from app.services import google_calendar_service  # imported lazily: only needed when connected

    for recurring in recurring_service.upcoming(db, within_days=14):
        try:
            google_calendar_service.upsert_event_for_recurring(db, recurring)
        except GoogleNotConnectedError:
            return
        except Exception:
            logger.exception("캘린더 이벤트 동기화 실패: %s", recurring.name)


def weekly_summary_email() -> None:
    """`notification_service.send_weekly_summary`는 Google이 연결되어 있지 않아도 인앱
    알림함(NotificationLog)에는 항상 기록하고, 실제 이메일 발송만 내부적으로 건너뛴다."""
    db = SessionLocal()
    try:
        notification_service.send_weekly_summary(db, today=today_kst())
    except Exception:
        logger.exception("주간 요약 알림 처리 실패")
        raise
    finally:
        db.close()


def monthly_summary_email() -> None:
    """weekly_summary_email과 동일하게, Google 미연결이어도 인앱 알림은 항상 남는다."""
    db = SessionLocal()
    try:
        notification_service.send_monthly_summary(db, today=today_kst())
    except Exception:
        logger.exception("월간 요약 알림 처리 실패")
        raise
    finally:
        db.close()


def daily_threshold_safety_net() -> None:
    """Catches any budget-threshold breaches the synchronous per-transaction check missed,
    and any goal milestones missed by the synchronous per-goal-save check. 챌린지 상태
    (status/completed_at)도 함께 재평가한다 — 저장 이벤트 없이 연동 잔액만 자연히 목표액을
    넘는 경우를 잡기 위함(goal_service.sync_challenge_statuses). Google 미연결이어도 인앱
    알림함에는 항상 기록된다 (이메일만 조건부)."""
    db = SessionLocal()
    errors: list[str] = []
    try:
        for step_name, step in (
            ("예산 초과 체크", lambda: notification_service.check_all_categories_threshold(db)),
            ("챌린지 상태 재평가", lambda: goal_service.sync_challenge_statuses(db, now=now_kst())),
            ("목표 달성 체크", lambda: notification_service.check_all_goal_milestones(db)),
        ):
            try:
                step()
            except Exception:
                logger.exception("안전망 체크 실패: %s", step_name)
                errors.append(step_name)
    finally:
        db.close()
    if errors:
        raise RuntimeError(f"안전망 체크 일부 실패: {', '.join(errors)}")


def monthly_net_worth_snapshot() -> None:
    """Records this month's net worth (accounts + savings - loans) for the growth-over-time chart."""
    db = SessionLocal()
    try:
        net_worth_service.record_snapshot(db, today=today_kst())
    except Exception:
        logger.exception("순자산 스냅샷 기록 실패")
        raise
    finally:
        db.close()


def event_reminder_check() -> None:
    """Sends reminder emails for shared events whose reminder time has arrived (15분 간격 실행).

    윈도우를 실행 주기(15분)보다 넓은 30분으로 잡는다 — GitHub Actions cron은 best-effort라
    5~15분씩 밀리거나 틱이 통째로 누락될 수 있는데, 좁은 윈도우면 그 사이 리마인더가 조용히
    유실된다. 중복 발송은 send_due_reminders의 NotificationLog dedup이 막는다."""
    db = SessionLocal()
    try:
        if not is_connected():
            return
        event_service.send_due_reminders(db, now=now_kst(), window_minutes=30)
    except Exception:
        logger.exception("일정 리마인더 발송 실패")
        raise
    finally:
        db.close()
