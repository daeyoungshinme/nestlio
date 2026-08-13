import logging
import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog
from app.models.notification_read import NotificationRead
from app.services import (
    budget_service,
    coaching_engine,
    email_templates,
    gmail_service,
    goal_service,
    milestone_service,
    notification_prefs_service,
    notify_recipients_service,
    transaction_report_service,
)
from app.services.google_auth import is_connected
from app.utils.dates import month_bounds, shift_month, week_bounds, year_month_str

logger = logging.getLogger(__name__)


class NotificationError(Exception):
    pass


class NotificationNotFoundError(NotificationError):
    pass


def _already_sent(db: Session, notif_type: str, period_key: str, related_id: int | None = None) -> bool:
    return (
        db.query(NotificationLog)
        .filter(
            NotificationLog.notif_type == notif_type,
            NotificationLog.year_month == period_key,
            NotificationLog.related_id == related_id,
        )
        .first()
        is not None
    )


def _log_sent(
    db: Session,
    notif_type: str,
    period_key: str,
    related_id: int | None = None,
    related_type: str | None = None,
    detail: str = "",
):
    db.add(
        NotificationLog(
            notif_type=notif_type,
            related_type=related_type or ("category" if related_id else None),
            related_id=related_id,
            year_month=period_key,
            status="sent",
            detail=detail[:500],
        )
    )
    db.commit()


def _format_summary(title: str, start: date, end: date, totals: dict, breakdown: list[dict]) -> str:
    lines = [
        f"{title} ({start} ~ {end})",
        "",
        f"수입: {totals['income']:,.0f}원",
        f"지출: {totals['expense']:,.0f}원",
        f"  - 고정지출: {totals['fixed']:,.0f}원",
        f"  - 변동지출: {totals['variable']:,.0f}원",
        f"  - 비정기지출: {totals['irregular']:,.0f}원",
        f"저축(수입-지출): {totals['savings']:,.0f}원",
        "",
        "카테고리별 지출:",
    ]
    for row in breakdown:
        lines.append(f"  - {row['name']}: {row['amount']:,.0f}원")
    return "\n".join(lines)


def send_weekly_summary(db: Session, today: date | None = None, force: bool = False) -> bool:
    today = today or date.today()
    start, end = week_bounds(today)
    period_key = start.isoformat()
    if not force and not notification_prefs_service.is_enabled(db, "email_weekly"):
        return False
    if not force and _already_sent(db, "email_weekly", period_key):
        return False
    totals = transaction_report_service.period_totals(db, start, end)
    breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    body = _format_summary("주간 가계부 요약", start, end, totals, breakdown)
    if is_connected():
        html = email_templates.build_weekly_summary_html(start, end, totals, breakdown)
        gmail_service.send_email(
            f"[Nestlio] 주간 요약 ({start} ~ {end})", body, to=notify_recipients_service.get_recipients(db), html_body=html
        )
    _log_sent(db, "email_weekly", period_key, detail=body[:500])
    return True


def send_monthly_summary(db: Session, today: date | None = None, force: bool = False) -> bool:
    today = today or date.today()
    prev_month_anchor = shift_month(today, -1)
    start, end = month_bounds(prev_month_anchor)
    period_key = year_month_str(start)
    if not force and not notification_prefs_service.is_enabled(db, "email_monthly"):
        return False
    if not force and _already_sent(db, "email_monthly", period_key):
        return False
    totals = transaction_report_service.period_totals(db, start, end)
    breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    body = _format_summary("월간 가계부 요약", start, end, totals, breakdown)

    insights = coaching_engine.compute_insights(db, period_key, totals=totals, breakdown=breakdown)
    if insights:
        body += "\n\n자산증식 코칭:\n"
        body += "\n".join(f"  - [{i.severity}] {i.message}" for i in insights)

    if is_connected():
        html = email_templates.build_monthly_summary_html(start, end, totals, breakdown, insights)
        gmail_service.send_email(
            f"[Nestlio] {period_key} 월간 요약", body, to=notify_recipients_service.get_recipients(db), html_body=html
        )
    _log_sent(db, "email_monthly", period_key, detail=body[:500])
    return True


def _send_threshold_alert(db: Session, row: dict, year_month: str) -> bool:
    """Send an alert for this already-computed budget_vs_actual row if it just crossed the
    warn/critical threshold, deduped so each status level fires at most once per category per month."""
    category_id = row["category_id"]
    if row["status"] not in ("warn", "critical") or row["budget"] <= 0:
        return False
    if not notification_prefs_service.is_enabled(db, "threshold_alert"):
        return False
    period_key = f"{year_month}:{row['status']}"
    if _already_sent(db, "threshold_alert", period_key, related_id=category_id):
        return False
    level = "위험" if row["status"] == "critical" else "주의"
    body = (
        f"{row['name']} 카테고리 예산 {level} 알림\n\n"
        f"예산: {row['budget']:,.0f}원\n"
        f"실제 지출: {row['actual']:,.0f}원 ({row['pct']:.0f}%)"
    )
    if is_connected():
        gmail_service.send_email(
            f"[Nestlio] 예산 {level} - {row['name']}", body, to=notify_recipients_service.get_recipients(db)
        )
    _log_sent(db, "threshold_alert", period_key, related_id=category_id, detail=body[:200])
    return True


def check_and_alert_budget_threshold(db: Session, category_id: int, year_month: str | None = None) -> bool:
    """Send an alert if this category just crossed the warn/critical budget threshold this month."""
    year_month = year_month or year_month_str(date.today())
    rows = budget_service.budget_vs_actual(db, year_month)
    row = next((r for r in rows if r["category_id"] == category_id), None)
    if row is None:
        return False
    return _send_threshold_alert(db, row, year_month)


def _celebrate_goal_milestone(db: Session, goal, today: date | None = None) -> bool:
    """Send a celebration email the first time this goal's progress crosses a milestone,
    deduped per goal per milestone so re-saving the same goal doesn't re-send. If progress
    jumped past multiple milestones at once, only the highest is sent. Milestone-crossing +
    dedup bookkeeping lives in milestone_service. 일반 목표(kind="goal")는 25/50/75/100% 각각
    축하하고, 챌린지(kind="challenge")는 옛 Challenge 모델과 동일하게 100% 한 번만 축하한다."""
    today = today or date.today()
    if goal is None or not goal.required_amount:
        return False
    is_challenge = goal.kind == "challenge"
    current_amount = goal_service.compute_current_amount(db, goal)
    progress_pct = goal_service.compute_progress_pct(current_amount, goal.required_amount)
    milestone = milestone_service.highest_crossed(progress_pct, milestones=(100,) if is_challenge else milestone_service.MILESTONES)
    if milestone is None:
        return False
    notif_type = "challenge_success" if is_challenge else "goal_milestone"
    related_type = "challenge" if is_challenge else "goal"
    if not notification_prefs_service.is_enabled(db, notif_type):
        return False
    if milestone_service.already_logged(db, notif_type, goal.id, milestone):
        return False
    if is_challenge:
        body = (
            f'\U0001F389 "{goal.name}" 챌린지 성공! \U0001F389\n\n'
            f"목표 {goal.required_amount:,.0f}원을 두 분이 함께 달성했어요!\n\n"
            f"현재: {current_amount:,.0f}원 / 목표 {goal.required_amount:,.0f}원"
        )
        subject = f"[Nestlio] 챌린지 성공 - {goal.name}"
    else:
        congrats = "드디어 목표를 이뤘어요! 두 분이 함께 만든 결과예요." if milestone >= 100 else "두 분이 함께 여기까지 왔어요, 축하해요!"
        body = (
            f'\U0001F389 "{goal.name}" 목표 {milestone}% 달성! \U0001F389\n\n'
            f"{congrats}\n\n"
            f"현재 저축액: {current_amount:,.0f}원 / 목표 {goal.required_amount:,.0f}원"
        )
        if milestone < 100 and goal.target_date is not None:
            remaining_amount = max(goal.required_amount - current_amount, 0)
            remaining_days = (goal.target_date - today).days
            if remaining_days > 0:
                body += f"\n목표일까지 D-{remaining_days}, 이제 {remaining_amount:,.0f}원만 더 모으면 돼요."
        subject = f"[Nestlio] 우리 부부 목표 달성 축하 - {goal.name} {milestone}%"
    if is_connected():
        gmail_service.send_email(subject, body, to=notify_recipients_service.get_recipients(db))
    milestone_service.log(db, notif_type, related_type, goal.id, milestone, body)
    return True


def check_and_celebrate_goal_milestone(db: Session, goal_id: int, today: date | None = None) -> bool:
    return _celebrate_goal_milestone(db, goal_service.get_goal(db, goal_id), today)


def check_all_goal_milestones(db: Session, today: date | None = None) -> int:
    sent = 0
    for goal in goal_service.list_goals(db):
        try:
            if _celebrate_goal_milestone(db, goal, today):
                sent += 1
        except Exception:
            logger.exception("goal_milestone_alert_failed goal_id=%s", goal.id)
    return sent


def check_all_categories_threshold(db: Session, year_month: str | None = None) -> int:
    year_month = year_month or year_month_str(date.today())
    rows = budget_service.budget_vs_actual(db, year_month)
    sent = 0
    for row in rows:
        try:
            if _send_threshold_alert(db, row, year_month):
                sent += 1
        except Exception:
            logger.exception("threshold_alert_failed category_id=%s", row["category_id"])
    return sent


def _read_log_ids(db: Session, user_id: uuid.UUID) -> set[int]:
    rows = db.query(NotificationRead.notification_log_id).filter(NotificationRead.user_id == user_id).all()
    return {row[0] for row in rows}


def list_notifications(db: Session, user_id: uuid.UUID, limit: int = 50) -> list[dict]:
    logs = db.query(NotificationLog).order_by(NotificationLog.sent_at.desc()).limit(limit).all()
    read_ids = _read_log_ids(db, user_id)
    return [
        {
            "id": log.id,
            "notif_type": log.notif_type,
            "related_type": log.related_type,
            "related_id": log.related_id,
            "year_month": log.year_month,
            "sent_at": log.sent_at,
            "detail": log.detail,
            "is_read": log.id in read_ids,
        }
        for log in logs
    ]


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    total = db.query(NotificationLog).count()
    return total - len(_read_log_ids(db, user_id))


def mark_read(db: Session, user_id: uuid.UUID, notification_log_id: int, now: datetime | None = None) -> None:
    now = now or datetime.now()
    log = db.get(NotificationLog, notification_log_id)
    if log is None:
        raise NotificationNotFoundError("알림을 찾을 수 없습니다.")
    existing = (
        db.query(NotificationRead)
        .filter(NotificationRead.notification_log_id == notification_log_id, NotificationRead.user_id == user_id)
        .first()
    )
    if existing is not None:
        return
    db.add(NotificationRead(notification_log_id=notification_log_id, user_id=user_id, read_at=now))
    db.commit()


def mark_all_read(db: Session, user_id: uuid.UUID, now: datetime | None = None) -> int:
    now = now or datetime.now()
    already_read = db.query(NotificationRead.notification_log_id).filter(NotificationRead.user_id == user_id)
    unread_ids = [row[0] for row in db.query(NotificationLog.id).filter(~NotificationLog.id.in_(already_read))]
    for log_id in unread_ids:
        db.add(NotificationRead(notification_log_id=log_id, user_id=user_id, read_at=now))
    if unread_ids:
        db.commit()
    return len(unread_ids)
