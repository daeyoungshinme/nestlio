from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.annual_savings_goal import AnnualSavingsGoal
from app.models.annual_savings_goal_monthly_target import AnnualSavingsGoalMonthlyTarget
from app.services import goal_service, plan_targets, transaction_report_service


def list_goals(db: Session) -> list[AnnualSavingsGoal]:
    return db.query(AnnualSavingsGoal).order_by(AnnualSavingsGoal.year.desc()).all()


def get_goal(db: Session, year: int) -> AnnualSavingsGoal | None:
    return db.query(AnnualSavingsGoal).filter(AnnualSavingsGoal.year == year).first()


def upsert_goal(db: Session, year: int, monthly_targets: list[dict]) -> AnnualSavingsGoal:
    goal = get_goal(db, year)
    if goal is None:
        goal = AnnualSavingsGoal(year=year)
        db.add(goal)
    plan_targets.apply_monthly_targets(goal, monthly_targets, AnnualSavingsGoalMonthlyTarget)
    goal.target_amount_krw = sum((mt.target_amount for mt in goal.monthly_targets), Decimal("0"))
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, year: int) -> None:
    goal = get_goal(db, year)
    if goal is not None:
        db.delete(goal)
        db.commit()


def compute_progress(db: Session, goal: AnnualSavingsGoal, today: date) -> dict:
    """가구 전체 현금흐름 순저축(수입-지출, transaction_report_service.yearly_monthly_breakdown의
    savings와 동일 정의 — goal_pace_insight가 이미 쓰는 "실제 저축액" 정의와 일치) 기준으로
    연간/월간 달성률을 계산한다. growlio는 자기 자신의 거래내역으로 별도 계산하므로
    이 함수의 결과는 nestlio 화면 표시 전용이며 growlio에 내려주지 않는다."""
    breakdown = transaction_report_service.yearly_monthly_breakdown(db, goal.year)
    if goal.year < today.year:
        included = breakdown
    elif goal.year == today.year:
        included = breakdown[: today.month]
    else:
        included = []
    net_savings_ytd = sum((row["savings"] for row in included), Decimal("0"))
    annual_achievement_pct = (
        net_savings_ytd / goal.target_amount_krw * 100 if goal.target_amount_krw else Decimal("0")
    )

    is_current_year = goal.year == today.year
    current_month_savings = breakdown[today.month - 1]["savings"] if is_current_year else Decimal("0")
    current_year_month = f"{today.year}-{today.month:02d}"
    monthly_target = next(
        (mt.target_amount for mt in goal.monthly_targets if mt.year_month == current_year_month), None
    )
    monthly_achievement_pct = (
        current_month_savings / monthly_target * 100 if is_current_year and monthly_target else None
    )

    return {
        "net_savings_ytd": net_savings_ytd,
        "annual_achievement_pct": annual_achievement_pct,
        "current_month_savings": current_month_savings,
        "monthly_achievement_pct": monthly_achievement_pct,
    }


def suggested_targets(db: Session, today: date) -> dict:
    """월/연 목표 입력값 제안을 두 가지 기준으로 계산한다 (저장된 AnnualSavingsGoal row
    유무와 무관 — 신규 연도에도 제안 가능해야 함):
    - 최근 3개월 가구 현금흐름 평균 저축액 기준 (기존)
    - 현재 등록된 재무목표(FinancialGoal)들의 월 저축금액 합계 기준 (목표 시스템 통합 —
      "우리가 세운 목표들을 다 합치면 올해 얼마를 모아야 하는가"를 그대로 제안값으로 보여준다)
    """
    suggested_monthly = transaction_report_service.trailing_average_savings(db, today, months=3)
    goal_based_monthly = sum(
        (g.monthly_saving_amount for g in goal_service.list_goals(db)), Decimal("0")
    )
    return {
        "suggested_monthly_target_krw": suggested_monthly,
        "suggested_annual_target_krw": suggested_monthly * 12,
        "goal_based_monthly_target_krw": goal_based_monthly,
        "goal_based_annual_target_krw": goal_based_monthly * 12,
    }


def to_out(db: Session, goal: AnnualSavingsGoal, today: date) -> dict:
    return {
        "year": goal.year,
        "target_amount_krw": goal.target_amount_krw,
        "monthly_target_krw": goal.monthly_target_krw,
        "monthly_targets": [
            {"year_month": mt.year_month, "target_amount": mt.target_amount} for mt in goal.monthly_targets
        ],
        "updated_at": goal.updated_at,
        **compute_progress(db, goal, today),
    }
