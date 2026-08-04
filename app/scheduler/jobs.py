import logging
from datetime import date, datetime

from app.database import SessionLocal
from app.services import event_service, net_worth_service, notification_service, recurring_service
from app.services.google_auth import GoogleNotConnectedError, is_connected

logger = logging.getLogger("scheduler")


def daily_due_date_check() -> None:
    """Post transactions for any recurring expense whose due date has arrived,
    and sync upcoming reminder events to Google Calendar (if connected)."""
    db = SessionLocal()
    try:
        recurring_service.generate_due_transactions(db)
        _sync_upcoming_calendar_events(db)
    except Exception:
        logger.exception("고정지출 거래 생성/캘린더 동기화 실패")
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
    db = SessionLocal()
    try:
        if not is_connected():
            logger.info("Google 계정 미연결 - 주간 요약 이메일 건너뜀")
            return
        notification_service.send_weekly_summary(db)
    except Exception:
        logger.exception("주간 요약 이메일 발송 실패")
    finally:
        db.close()


def monthly_summary_email() -> None:
    db = SessionLocal()
    try:
        if not is_connected():
            logger.info("Google 계정 미연결 - 월간 요약 이메일 건너뜀")
            return
        notification_service.send_monthly_summary(db)
    except Exception:
        logger.exception("월간 요약 이메일 발송 실패")
    finally:
        db.close()


def daily_threshold_safety_net() -> None:
    """Catches any budget-threshold breaches the synchronous per-transaction check missed,
    and any goal milestones missed by the synchronous per-goal-save check."""
    db = SessionLocal()
    try:
        if not is_connected():
            return
        notification_service.check_all_categories_threshold(db)
        notification_service.check_all_goal_milestones(db)
    except Exception:
        logger.exception("예산 초과/목표 달성 안전망 체크 실패")
    finally:
        db.close()


def monthly_net_worth_snapshot() -> None:
    """Records this month's net worth (accounts + savings - loans) for the growth-over-time chart."""
    db = SessionLocal()
    try:
        net_worth_service.record_snapshot(db, today=date.today())
    except Exception:
        logger.exception("순자산 스냅샷 기록 실패")
    finally:
        db.close()


def event_reminder_check() -> None:
    """Sends reminder emails for shared events whose reminder time has arrived (15분 간격 실행)."""
    db = SessionLocal()
    try:
        if not is_connected():
            return
        event_service.send_due_reminders(db, now=datetime.now(), window_minutes=15)
    except Exception:
        logger.exception("일정 리마인더 발송 실패")
    finally:
        db.close()
