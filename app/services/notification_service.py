import logging
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.services import (
    budget_service,
    coaching_engine,
    email_templates,
    gmail_service,
    goal_progress_service,
    goal_service,
    milestone_service,
    notification_log_service,
    notification_settings_service,
    retrospective_service,
    transaction_report_service,
)
from app.services.google_auth import is_connected
from app.utils.dates import today_kst, week_bounds, year_month_str

logger = logging.getLogger(__name__)




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


def _savings_streak(db: Session, end: date) -> int:
    """대시보드(GET /dashboard)와 같은 계산(coaching_engine.savings_streak_months)을 재사용해
    주간/월간 요약 알림에도 "연속 몇 개월째 목표 페이스를 지키고 있는지"를 함께 보여준다."""
    goals = goal_service.list_goals(db)
    target_monthly = sum((g.monthly_saving_amount for g in goals), Decimal("0"))
    trend = transaction_report_service.monthly_trend(db, months=6, anchor=end)
    return coaching_engine.savings_streak_months(trend, target_monthly)


def _contribution_summary_text(owner_totals: list[dict]) -> str | None:
    """부부 각자의 저축 기여도(totals_by_owner, owner_user_id 기준 실제 지출/저축 주체)를 한 줄로
    요약한다 — 대시보드 CoupleContributionCard와 같은 축. "공통" 항목과 1인 가구는 비교 대상이
    아니므로 생략(정렬·리더 판정은 transaction_report_service.rank_owner_contributions 공유)."""
    ranked = transaction_report_service.rank_owner_contributions(owner_totals)
    if ranked is None:
        return None
    parts = [f"{o['display_name']} {o['savings']:,.0f}원" for o in ranked]
    line = "부부 저축 기여도: " + " · ".join(parts)
    leader = next((o for o in ranked if o["is_leader"]), None)
    if leader:
        line += f" — {leader['display_name']}님이 이번엔 더 모았어요"
    return line


def _with_streak_and_contribution(body: str, *, streak: int, owner_totals: list[dict]) -> str:
    """주간·월간 요약 본문에 공통으로 붙는 '연속 N개월 페이스' + '부부 기여도' 줄을 덧붙인다."""
    extra_lines = []
    if streak > 0:
        extra_lines.append(f"연속 {streak}개월째 목표 페이스를 지키고 있어요 \U0001F525")
    contribution_text = _contribution_summary_text(owner_totals)
    if contribution_text:
        extra_lines.append(contribution_text)
    if extra_lines:
        body += "\n\n" + "\n".join(extra_lines)
    return body


def send_weekly_summary(db: Session, today: date | None = None, force: bool = False) -> bool:
    today = today or today_kst()
    start, end = week_bounds(today)
    period_key = start.isoformat()
    if not force and not notification_settings_service.is_enabled(db, "email_weekly"):
        return False
    if not force and notification_log_service.already_sent(db, "email_weekly", period_key):
        return False
    totals = transaction_report_service.period_totals(db, start, end)
    breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    owner_totals = transaction_report_service.totals_by_owner(db, start, end)
    streak = _savings_streak(db, end)
    body = _format_summary("주간 가계부 요약", start, end, totals, breakdown)
    body = _with_streak_and_contribution(body, streak=streak, owner_totals=owner_totals)

    if is_connected():
        html = email_templates.build_weekly_summary_html(
            start, end, totals, breakdown, owner_totals=owner_totals, streak=streak
        )
        gmail_service.send_email(
            f"[Nestlio] 주간 요약 ({start} ~ {end})", body, to=notification_settings_service.get_recipients(db), html_body=html
        )
    notification_log_service.log_sent(db, "email_weekly", period_key, detail=body[:500])
    return True


def send_monthly_summary(db: Session, today: date | None = None, force: bool = False) -> bool:
    today = today or today_kst()
    r = retrospective_service.build(db, today)
    start, end, period_key = r["start"], r["end"], r["year_month"]
    if not force and not notification_settings_service.is_enabled(db, "email_monthly"):
        return False
    if not force and notification_log_service.already_sent(db, "email_monthly", period_key):
        return False
    totals, breakdown, owner_totals, insights = r["totals"], r["breakdown"], r["owner_totals"], r["insights"]
    streak = _savings_streak(db, end)
    body = _format_summary("월간 가계부 요약", start, end, totals, breakdown)
    body = _with_streak_and_contribution(body, streak=streak, owner_totals=owner_totals)

    if insights:
        body += "\n\n자산증식 코칭:\n"
        body += "\n".join(f"  - [{i.severity}] {i.message}" for i in insights)

    if is_connected():
        html = email_templates.build_monthly_summary_html(
            start, end, totals, breakdown, insights, owner_totals=owner_totals, streak=streak
        )
        gmail_service.send_email(
            f"[Nestlio] {period_key} 월간 요약", body, to=notification_settings_service.get_recipients(db), html_body=html
        )
    notification_log_service.log_sent(db, "email_monthly", period_key, detail=body[:500])
    return True


def _send_threshold_alert(db: Session, row: dict, year_month: str) -> bool:
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
    level = "위험" if row["status"] == "critical" else "주의"
    body = (
        f"{row['name']} 카테고리 예산 {level} 알림\n\n"
        f"예산: {row['budget']:,.0f}원\n"
        f"실제 지출: {row['actual']:,.0f}원 ({row['pct']:.0f}%)"
    )
    if is_connected():
        gmail_service.send_email(
            f"[Nestlio] 예산 {level} - {row['name']}", body, to=notification_settings_service.get_recipients(db)
        )
    notification_log_service.log_sent(db, "threshold_alert", period_key, related_id=category_id, detail=body[:200])
    return True


def check_and_alert_budget_threshold(db: Session, category_id: int, year_month: str | None = None) -> bool:
    """Send an alert if this category just crossed the warn/critical budget threshold this month."""
    year_month = year_month or year_month_str(today_kst())
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
    today = today or today_kst()
    if goal is None or not goal.required_amount:
        return False
    is_challenge = goal.kind == "challenge"
    current_amount = goal_progress_service.compute_current_amount(db, goal)
    progress_pct = goal_progress_service.compute_progress_pct(current_amount, goal.required_amount)
    milestone = milestone_service.highest_crossed(progress_pct, milestones=(100,) if is_challenge else milestone_service.MILESTONES)
    if milestone is None:
        return False
    notif_type = "challenge_success" if is_challenge else "goal_milestone"
    related_type = "challenge" if is_challenge else "goal"
    if not notification_settings_service.is_enabled(db, notif_type):
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
        gmail_service.send_email(subject, body, to=notification_settings_service.get_recipients(db))
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
            # 한 목표의 실패가 세션을 오염시켜 이후 log_sent 커밋이 연쇄 실패하지 않도록 롤백.
            db.rollback()
            logger.exception("goal_milestone_alert_failed goal_id=%s", goal.id)
    return sent


def check_all_categories_threshold(db: Session, year_month: str | None = None) -> int:
    year_month = year_month or year_month_str(today_kst())
    rows = budget_service.budget_vs_actual(db, year_month)
    sent = 0
    for row in rows:
        try:
            if _send_threshold_alert(db, row, year_month):
                sent += 1
        except Exception:
            db.rollback()
            logger.exception("threshold_alert_failed category_id=%s", row["category_id"])
    return sent
