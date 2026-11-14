import logging
from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.errors import ConflictError, PartialFailureError
from app.services import (
    budget_service,
    coaching_settings_service,
    dashboard_service,
    email_templates,
    gmail_service,
    goal_progress_service,
    goal_service,
    notification_log_service,
    notification_settings_service,
    savings_coaching_service,
    savings_product_plan_service,
    transaction_report_service,
    transaction_trend_service,
)
from app.services.gmail_service import GmailSendError
from app.services.google_auth import GoogleAuthError, is_connected
from app.utils.dates import month_bounds, today_kst, week_bounds, year_month_str

logger = logging.getLogger(__name__)

GOOGLE_REAUTH_NOTIF_TYPE = "google_reauth"


# "sent" = 발송함, "skipped" = 보낼 수 없는 상태(Google 미연결·토큰 만료·수신자 없음 — 재시도해도 같음),
# "failed" = Gmail API 오류(다음에 다시 시도할 가치가 있음).
MailResult = Literal["sent", "skipped", "failed"]


def send_email_best_effort(
    db: Session, subject: str, body: str, *, html_body: str | None = None, to: list[str] | None = None
) -> MailResult:
    """모든 알림 메일의 단일 발송 경로. 알림 메일은 부가 채널이다 — 인앱 알림(NotificationLog)이 정본이라,
    메일 발송 실패가 호출부의 log_sent까지 막아 인앱 알림이 유실되거나 예약 잡이 500으로 끝나면 안 된다.
    그래서 예외를 던지지 않고 결과만 돌려준다. 토큰 만료는 부부가 알아야 고칠 수 있으므로 인앱 알림도
    (월 1회) 남긴다. `to`를 안 주면 설정된 수신자 전원(notification_settings_service.get_recipients)."""
    if not is_connected():
        return "skipped"
    recipients = to if to is not None else notification_settings_service.get_recipients(db)
    if not recipients:
        return "skipped"
    try:
        gmail_service.send_email(subject, body, to=recipients, html_body=html_body)
    except GoogleAuthError as exc:
        logger.warning("알림 메일 미발송 — 구글 재연결 필요: %s", subject)
        _log_google_reauth_needed(db, str(exc))
        return "skipped"
    except GmailSendError:
        logger.warning("알림 메일 발송 실패: %s", subject, exc_info=True)
        return "failed"
    return "sent"


def queue_email_best_effort(
    db: Session,
    subject: str,
    body: str,
    *,
    background_tasks: BackgroundTasks | None,
    html_body: str | None = None,
    to: list[str] | None = None,
) -> None:
    """요청 처리 중에 부르는 알림 메일 — 수신자만 지금 정하고 Gmail 호출은 응답 뒤로 미룬다(BackgroundTasks).
    Gmail이 느리거나 응답하지 않아도 저장 요청이 그만큼 붙잡히지 않게. 응답 뒤에는 요청 세션이 닫히므로
    발송은 자체 세션으로 한다(`_send_email_detached`). background_tasks가 없으면(예약 잡·직접 호출) 바로 보낸다."""
    if background_tasks is None:
        send_email_best_effort(db, subject, body, html_body=html_body, to=to)
        return
    recipients = to if to is not None else notification_settings_service.get_recipients(db)
    if not recipients:
        return
    background_tasks.add_task(_send_email_detached, subject, body, html_body, recipients)


def _send_email_detached(subject: str, body: str, html_body: str | None, recipients: list[str]) -> None:
    """응답 뒤 BackgroundTasks로 도는 발송 — 자체 세션(토큰 만료 시 인앱 알림 기록용)을 열고 절대 raise하지 않는다."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        send_email_best_effort(db, subject, body, html_body=html_body, to=recipients)
    except Exception:
        db.rollback()
        logger.exception("알림 메일 백그라운드 발송 실패: %s", subject)
    finally:
        db.close()


def _log_google_reauth_needed(db: Session, message: str) -> None:
    period_key = year_month_str(today_kst())
    if notification_log_service.already_sent(db, GOOGLE_REAUTH_NOTIF_TYPE, period_key):
        return
    notification_log_service.log_sent(db, GOOGLE_REAUTH_NOTIF_TYPE, period_key, detail=message)


def _savings_streak(db: Session, end: date) -> int:
    """대시보드(GET /dashboard)와 같은 계산(savings_coaching_service.savings_streak_months)을 재사용해
    주간/월간 요약 알림에도 "연속 몇 개월째 목표 페이스를 지키고 있는지"를 함께 보여준다."""
    goals = goal_service.list_goals(db)
    trend = transaction_trend_service.monthly_trend(db, months=6, anchor=end)
    return savings_coaching_service.savings_streak_months(savings_coaching_service.savings_pace_history(db, trend, goals))


def _weekly_period(today: date) -> tuple[date, date, str]:
    # 잡은 월요일 아침에 돈다 — 막 시작한 이번 주가 아니라 방금 끝난 지난주를 요약한다. dedup 키는 발송한 주의
    # 월요일이다(요약 대상인 지난주 월요일로 바꾸면 그날 옛 코드가 남긴 기록과 겹쳐 한 주가 빠진다).
    start, end = week_bounds(today - timedelta(days=7))
    return start, end, week_bounds(today)[0].isoformat()


def _weekly_mail(db: Session, today: date) -> tuple[str, str, str]:
    """주간 요약 메일의 (제목, 텍스트 본문, HTML 본문)."""
    start, end, _ = _weekly_period(today)
    snapshot = transaction_report_service.period_snapshot(db, start, end)
    totals, breakdown, owner_totals = snapshot["totals"], snapshot["breakdown"], snapshot["owner_totals"]
    streak = _savings_streak(db, end)
    body = email_templates.summary_text(
        "주간 가계부 요약", start, end, totals, breakdown, owner_totals=owner_totals, streak=streak
    )
    html = email_templates.build_weekly_summary_html(
        start, end, totals, breakdown, owner_totals=owner_totals, streak=streak
    )
    return f"[Nestlio] 주간 요약 ({start} ~ {end})", body, html


def _monthly_mail(db: Session, today: date) -> tuple[str, str, str]:
    """월간 요약 메일의 (제목, 텍스트 본문, HTML 본문)."""
    r = dashboard_service.build_retrospective(db, today)
    start, end, period_key = r["start"], r["end"], r["year_month"]
    totals, breakdown, owner_totals, insights = r["totals"], r["breakdown"], r["owner_totals"], r["insights"]
    streak = _savings_streak(db, end)
    body = email_templates.summary_text(
        "월간 가계부 요약", start, end, totals, breakdown, owner_totals=owner_totals, streak=streak, insights=insights
    )
    html = email_templates.build_monthly_summary_html(
        start, end, totals, breakdown, insights, owner_totals=owner_totals, streak=streak
    )
    return f"[Nestlio] {period_key} 월간 요약", body, html


def send_weekly_summary(db: Session, today: date | None = None) -> bool:
    today = today or today_kst()
    _, _, period_key = _weekly_period(today)
    return _send_summary(db, "email_weekly", period_key, _weekly_mail, today)


def send_monthly_summary(db: Session, today: date | None = None) -> bool:
    today = today or today_kst()
    _, _, period_key = dashboard_service.retrospective_period(today)
    return _send_summary(db, "email_monthly", period_key, _monthly_mail, today)


def _send_summary(
    db: Session, setting_key: str, period_key: str, build: Callable[[Session, date], tuple[str, str, str]], today: date
) -> bool:
    """정기 요약 발송 — 켜짐·중복 여부를 먼저 본다(회고 집계(코칭 인사이트 포함)는 매일 도는 예약 잡에서 대부분
    버려진다). 메일은 best-effort, 인앱 기록(log_sent)은 항상 남긴다."""
    if not notification_settings_service.is_enabled(db, setting_key):
        return False
    if notification_log_service.already_sent(db, setting_key, period_key):
        return False
    subject, body, html = build(db, today)
    send_email_best_effort(db, subject, body, html_body=html)
    notification_log_service.log_sent(db, setting_key, period_key, detail=body[:500])
    return True


def _send_threshold_alert(
    db: Session, row: dict, year_month: str, background_tasks: BackgroundTasks | None = None
) -> bool:
    """Send an alert for this already-computed budget_vs_actual row if it just crossed the
    warn/critical threshold, deduped so each status level fires at most once per category per month."""
    category_id = row["category_id"]
    if row["status"] not in ("warn", "critical") or row["budget"] <= 0:
        return False
    if not notification_settings_service.is_enabled(db, "threshold_alert"):
        return False
    period_key = f"{year_month}:{row['status']}"
    if notification_log_service.already_sent(db, "threshold_alert", period_key, related_id=category_id):
        return False
    subject, body = email_templates.threshold_alert_message(row)
    queue_email_best_effort(db, subject, body, background_tasks=background_tasks)
    notification_log_service.log_sent(db, "threshold_alert", period_key, related_id=category_id, detail=body[:200])
    return True


def check_and_alert_budget_threshold(
    db: Session,
    category_id: int,
    year_month: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> bool:
    """Send an alert if this category just crossed the warn/critical budget threshold this month.

    거래 저장 직후 라우터가 호출하는 부가 작업이라, 실패하면 세션을 롤백한 뒤 다시 던진다 —
    라우터는 예외를 로그만 남기고 같은 세션으로 응답을 만들기 때문에 오염된 세션이 남으면
    이미 저장된 거래까지 500으로 응답된다."""
    try:
        year_month = year_month or year_month_str(today_kst())
        warn_pct, critical_pct = coaching_settings_service.budget_thresholds(db)
        rows = budget_service.budget_vs_actual(db, year_month, warn_pct, critical_pct, with_suggested=False)
        row = next((r for r in rows if r["category_id"] == category_id), None)
        if row is None:
            return False
        return _send_threshold_alert(db, row, year_month, background_tasks)
    except Exception:
        db.rollback()
        raise


def _celebrate_goal_milestone(
    db: Session, goal, today: date | None = None, current_amount: Decimal | None = None
) -> bool:
    """Send a celebration email the first time this goal's progress crosses a milestone,
    deduped per goal per milestone so re-saving the same goal doesn't re-send. If progress
    jumped past multiple milestones at once, only the highest is sent. Milestone-crossing +
    dedup bookkeeping lives in notification_log_service. 일반 목표(kind="goal")는 25/50/75/100% 각각
    축하하고, 챌린지(kind="challenge")는 옛 Challenge 모델과 동일하게 100% 한 번만 축하한다.
    current_amount는 일괄 확인(check_all_goal_milestones)이 미리 계산해 넘기는 값이다."""
    today = today or today_kst()
    if goal is None or not goal.required_amount:
        return False
    is_challenge = goal.kind == "challenge"
    if current_amount is None:
        current_amount = goal_progress_service.compute_current_amount(db, goal)
    progress_pct = goal_progress_service.compute_progress_pct(current_amount, goal.required_amount)
    milestone = notification_log_service.highest_crossed_milestone(
        progress_pct, milestones=(100,) if is_challenge else notification_log_service.MILESTONES
    )
    if milestone is None:
        return False
    notif_type = "challenge_success" if is_challenge else "goal_milestone"
    related_type = "challenge" if is_challenge else "goal"
    if not notification_settings_service.is_enabled(db, notif_type):
        return False
    if notification_log_service.milestone_already_logged(db, notif_type, goal.id, milestone):
        return False
    subject, body = email_templates.goal_milestone_message(goal, milestone, current_amount, today)
    send_email_best_effort(db, subject, body)
    notification_log_service.log_milestone(db, notif_type, related_type, goal.id, milestone, body)
    return True


def check_and_celebrate_goal_milestone(db: Session, goal_id: int, today: date | None = None) -> bool:
    """목표 저장 직후 라우터가 호출한다. 실패 시 롤백 후 다시 던지는 이유는
    check_and_alert_budget_threshold와 같다."""
    try:
        return _celebrate_goal_milestone(db, goal_service.get_goal(db, goal_id), today)
    except Exception:
        db.rollback()
        raise


def check_all_goal_milestones(db: Session, today: date | None = None) -> int:
    goals = goal_service.list_goals(db)
    # 진행금액은 한 번에 계산한다(goal_progress_service.current_amounts) — 목표마다 조회하면 N+1이 된다.
    amounts = goal_progress_service.current_amounts(db, goals)
    sent = failed = 0
    for goal in goals:
        try:
            if _celebrate_goal_milestone(db, goal, today, current_amount=amounts[goal.id]):
                sent += 1
        except Exception:
            # 한 목표의 실패가 세션을 오염시켜 이후 log_sent 커밋이 연쇄 실패하지 않도록 롤백.
            db.rollback()
            failed += 1
            logger.exception("goal_milestone_alert_failed goal_id=%s", goal.id)
    if failed:
        raise PartialFailureError("목표 달성 알림", failed, sent)
    return sent


def check_all_categories_threshold(db: Session, year_month: str | None = None) -> int:
    year_month = year_month or year_month_str(today_kst())
    warn_pct, critical_pct = coaching_settings_service.budget_thresholds(db)
    rows = budget_service.budget_vs_actual(db, year_month, warn_pct, critical_pct)
    sent = failed = 0
    for row in rows:
        try:
            if _send_threshold_alert(db, row, year_month):
                sent += 1
        except Exception:
            db.rollback()
            failed += 1
            logger.exception("threshold_alert_failed category_id=%s", row["category_id"])
    if failed:
        raise PartialFailureError("예산 초과 알림", failed, sent)
    return sent


SAVINGS_REMINDER_DAYS_BEFORE_MONTH_END = 3


def check_savings_pace_reminder(db: Session, today: date | None = None) -> bool:
    """월말 3일 전부터, 이번 달 저축·투자 계획(savings_product_plan_service)을 아직 다 채우지 못했으면 "N원 남았어요"를
    한 번(월 1회, dedup) 알린다 — 연속 달성(streak)이 끊기기 전에 부부가 함께 채울 수 있게. 계획이 없거나 이미
    채웠으면 보내지 않는다. 이메일은 Google 연결 시에만, 인앱 알림은 항상 남는다."""
    today = today or today_kst()
    _, month_end = month_bounds(today)
    if (month_end - today).days >= SAVINGS_REMINDER_DAYS_BEFORE_MONTH_END:
        return False
    if not notification_settings_service.is_enabled(db, "savings_pace_reminder"):
        return False
    year_month = year_month_str(today)
    if notification_log_service.already_sent(db, "savings_pace_reminder", year_month):
        return False
    planned, deposits = savings_product_plan_service.plan_totals_for_month(db, year_month)
    remaining = planned - deposits
    if planned <= 0 or remaining <= 0:
        return False
    streak = _savings_streak(db, today)
    subject, body = email_templates.savings_pace_reminder_message(planned, remaining, streak)
    send_email_best_effort(db, subject, body)
    notification_log_service.log_sent(db, "savings_pace_reminder", year_month, detail=body)
    return True


def alert_budget_after_transaction_save(db: Session, tx, background_tasks: BackgroundTasks | None = None) -> None:
    """지출 거래 저장 직후 그 카테고리 예산 임계치 알림 — 실패해도 거래는 이미 저장됐으니 로그만 남긴다
    (check_and_alert_budget_threshold가 실패 시 롤백까지 하므로 호출자는 같은 세션으로 응답을 만들 수 있다).
    과거 날짜 지출이면 그 달 예산을 본다(이번 달 기준이면 엉뚱한 달을 검사한다). 메일은 응답 뒤에 보낸다."""
    if tx.type != "expense":
        return
    try:
        check_and_alert_budget_threshold(
            db, tx.category_id, year_month_str(tx.transaction_date), background_tasks=background_tasks
        )
    except Exception:
        logger.exception("예산 초과 알림 발송 실패 (거래는 정상 저장됨)")


def celebrate_goal_milestone_best_effort(db: Session, goal_id: int, today: date | None = None) -> None:
    """목표 생성·수정·월별 실적 입력 직후 호출 — 축하 알림 실패가 목표 저장 응답을 막지 않게 로그만 남긴다."""
    try:
        check_and_celebrate_goal_milestone(db, goal_id, today)
    except Exception:
        logger.exception("목표 달성 축하 알림 처리 실패 (목표는 정상 저장됨)")


_TEST_SUMMARY = {
    "weekly": ("email_weekly", "주간", _weekly_mail),
    "monthly": ("email_monthly", "월간", _monthly_mail),
}


def send_test_summary(db: Session, kind: Literal["weekly", "monthly"], today: date | None = None) -> dict:
    """설정 화면의 테스트 발송 버튼. "Google 연동이 실제로 동작하는지" 확인하는 QA용이라, 일반 알림
    파이프라인과 달리 미연동/꺼짐/수신자 없음은 ConflictError(409)로 알리고, Gmail 실패·토큰 만료도 흡수하지 않고
    올린다(전역 핸들러가 502/409로 변환). 정규 발송 기록(log_sent)을 남기지 않는다 — 남기면 그 주·그 달의 예약
    발송이 dedup에 막힌다."""
    setting_key, label, build = _TEST_SUMMARY[kind]
    if not is_connected():
        raise ConflictError("Google 계정이 연결되어 있지 않습니다.")
    if not notification_settings_service.is_enabled(db, setting_key):
        raise ConflictError(f"{label} 요약 알림이 꺼져 있습니다. 설정에서 켜주세요.")
    recipients = notification_settings_service.get_recipients(db)
    if not recipients:
        raise ConflictError("알림 메일을 받을 사람이 없습니다. 설정에서 수신자를 확인해주세요.")
    subject, body, html = build(db, today or today_kst())
    gmail_service.send_email(subject, body, to=recipients, html_body=html)
    return {"sent": True, "message": f"{label} 요약 이메일을 발송했습니다."}
