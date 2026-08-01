from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog
from app.services import budget_service, coaching_engine, gmail_service, goal_service, transaction_service
from app.utils.dates import month_bounds, week_bounds, year_month_str

# progress-percent thresholds that trigger a "milestone reached" celebration email, ascending
GOAL_MILESTONES = (25, 50, 75, 100)


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
    if not force and _already_sent(db, "email_weekly", period_key):
        return False
    totals = transaction_service.period_totals(db, start, end)
    breakdown = transaction_service.category_breakdown(db, start, end, "expense")
    body = _format_summary("주간 가계부 요약", start, end, totals, breakdown)
    gmail_service.send_email(f"[Nestlio] 주간 요약 ({start} ~ {end})", body)
    _log_sent(db, "email_weekly", period_key)
    return True


def send_monthly_summary(db: Session, today: date | None = None, force: bool = False) -> bool:
    today = today or date.today()
    prev_month_anchor = today.replace(day=1) - timedelta(days=1)
    start, end = month_bounds(prev_month_anchor)
    period_key = year_month_str(start)
    if not force and _already_sent(db, "email_monthly", period_key):
        return False
    totals = transaction_service.period_totals(db, start, end)
    breakdown = transaction_service.category_breakdown(db, start, end, "expense")
    body = _format_summary("월간 가계부 요약", start, end, totals, breakdown)

    insights = coaching_engine.compute_insights(db, period_key)
    if insights:
        body += "\n\n자산증식 코칭:\n"
        body += "\n".join(f"  - [{i.severity}] {i.message}" for i in insights)

    gmail_service.send_email(f"[Nestlio] {period_key} 월간 요약", body)
    _log_sent(db, "email_monthly", period_key)
    return True


def check_and_alert_budget_threshold(db: Session, category_id: int, year_month: str | None = None) -> bool:
    """Send an alert if this category just crossed the warn/critical budget threshold
    this month, deduped so each status level fires at most once per category per month."""
    year_month = year_month or year_month_str(date.today())
    rows = budget_service.budget_vs_actual(db, year_month)
    row = next((r for r in rows if r["category_id"] == category_id), None)
    if row is None or row["status"] not in ("warn", "critical") or row["budget"] <= 0:
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
    gmail_service.send_email(f"[Nestlio] 예산 {level} - {row['name']}", body)
    _log_sent(db, "threshold_alert", period_key, related_id=category_id, detail=body[:200])
    return True


def check_and_celebrate_goal_milestone(db: Session, goal_id: int) -> bool:
    """Send a celebration email the first time a goal's progress crosses a milestone
    (25/50/75/100%), deduped per goal per milestone so re-saving the same goal doesn't
    re-send. If progress jumped past multiple milestones at once, only the highest is sent."""
    goal = goal_service.get_goal(db, goal_id)
    if goal is None or not goal.required_amount:
        return False
    progress = float(goal.progress_pct)
    reached = [m for m in GOAL_MILESTONES if progress >= m]
    if not reached:
        return False
    milestone = max(reached)
    period_key = str(milestone)
    if _already_sent(db, "goal_milestone", period_key, related_id=goal_id):
        return False
    body = (
        f'"{goal.name}" 목표가 {milestone}% 달성했어요! \U0001F389\n\n'
        f"현재 저축액: {goal.current_amount:,.0f}원 / 목표 {goal.required_amount:,.0f}원"
    )
    gmail_service.send_email(f"[Nestlio] 목표 달성 축하 - {goal.name} {milestone}%", body)
    _log_sent(db, "goal_milestone", period_key, related_id=goal_id, related_type="goal", detail=body[:200])
    return True


def check_all_goal_milestones(db: Session) -> int:
    sent = 0
    for goal in goal_service.list_goals(db):
        if check_and_celebrate_goal_milestone(db, goal.id):
            sent += 1
    return sent


def check_all_categories_threshold(db: Session, year_month: str | None = None) -> int:
    year_month = year_month or year_month_str(date.today())
    rows = budget_service.budget_vs_actual(db, year_month)
    sent = 0
    for row in rows:
        if row["status"] in ("warn", "critical") and row["budget"] > 0:
            if check_and_alert_budget_threshold(db, row["category_id"], year_month):
                sent += 1
    return sent
