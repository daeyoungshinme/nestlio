"""저축 실행 코칭 — 이번 달 여유자금을 비상금 보충/투자로 나누는 배분(`recommend_surplus_allocation`),
비상금 잔액·평균 고정지출 조회(`emergency_fund_context`), 목표 페이스·연속 달성의 (실적, 목표) 기준
(`savings_pace_basis`/`savings_pace_history`/`savings_streak_months`). 규칙 기반 인사이트 문구는
`coaching_engine`이 이 값들을 받아 만든다(이 모듈은 coaching_engine을 import하지 않는다)."""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.financial_goal import FinancialGoal
from app.services import (
    goal_progress_service,
    savings_product_plan_service,
    savings_product_service,
    transaction_trend_service,
)
from app.utils.money import whole_won


def investable_surplus(totals: dict, actual_saved: Decimal | None) -> Decimal:
    """이번달 여유자금(수입-지출) 중 아직 저축·투자로 옮겨지지 않은 금액.
    savings_execution_insight와 같은 입력을 쓰는 자매 함수 — growlio 투자 유도 카드에 쓰인다."""
    surplus = totals["savings"]
    if actual_saved is None or surplus <= 0:
        return Decimal("0")
    return max(surplus - actual_saved, Decimal("0"))


def recommend_surplus_allocation(
    surplus: Decimal, emergency_fund_balance: Decimal | None, avg_monthly_fixed: Decimal
) -> dict:
    """이번달 투자 가능 여유자금(investable_surplus)을 비상금 보충분과 투자 가능분으로 나눈다.
    비상금이 emergency_fund_insight와 같은 기준(settings.emergency_fund_target_months)에 못 미치면
    부족분을 여유자금에서 먼저 채우도록 제안하고, 남는 만큼만 투자 가능분으로 돌린다. 비상금
    잔액이 설정되지 않았거나 평균 고정지출을 알 수 없으면(커버리지 계산 불가) 전액 투자
    가능분으로 취급한다 — InvestSurplusCard가 "잉여자금을 growlio에 담으라"고 무조건 권하던
    기존 동작과의 하위호환."""
    if surplus <= 0:
        return {"emergency_fund_portion": Decimal("0"), "investable_portion": Decimal("0")}
    if emergency_fund_balance is None or avg_monthly_fixed <= 0:
        return {"emergency_fund_portion": Decimal("0"), "investable_portion": surplus}
    target_balance = avg_monthly_fixed * settings.emergency_fund_target_months
    shortfall = max(target_balance - emergency_fund_balance, Decimal("0"))
    emergency_fund_portion = min(shortfall, surplus)
    return {"emergency_fund_portion": emergency_fund_portion, "investable_portion": surplus - emergency_fund_portion}


def emergency_fund_context(db: Session, month_start: date) -> tuple[Decimal | None, Decimal | None]:
    """비상금 잔액과 최근 3개월 평균 고정지출 — compute_insights와 compute_surplus_allocation이
    같은 달을 대상으로 함께 호출될 때(app/routers/dashboard.py) 각자 재조회하지 않고 공유할 수
    있도록 뽑아낸 조회 헬퍼. 등록된 비상금 상품이 없으면 (None, None)."""
    balance = savings_product_service.get_emergency_fund_balance(db)
    # 0원은 "비상금 없음"이 아니라 "비상금이 바닥남" — 가장 경고가 필요한 상태라 None과 구분한다.
    if balance is None:
        return None, None
    trend = transaction_trend_service.monthly_trend(db, months=3, anchor=month_start)
    avg_fixed = whole_won(sum((row["fixed"] for row in trend), Decimal("0")) / len(trend))
    return balance, avg_fixed


def compute_surplus_allocation(
    db: Session,
    month_start: date,
    surplus: Decimal,
    fund_context: tuple[Decimal | None, Decimal | None] | None = None,
) -> dict:
    """recommend_surplus_allocation에 필요한 비상금 잔액/평균 고정지출을 조회해 넘겨주는
    DB-aware 래퍼. 호출부가 이미 emergency_fund_context를 조회해둔 경우 fund_context로 넘겨받아
    재조회를 피한다."""
    current_balance, avg_fixed = fund_context if fund_context is not None else emergency_fund_context(db, month_start)
    if current_balance is None:
        return recommend_surplus_allocation(surplus, None, Decimal("0"))
    return recommend_surplus_allocation(surplus, current_balance, avg_fixed)


def savings_pace_basis(
    planned_savings: Decimal, deposits: Decimal, goals_monthly: Decimal, surplus: Decimal
) -> tuple[Decimal, Decimal]:
    """목표 페이스·연속 달성이 비교할 (실적, 목표) 쌍. 저축·투자 계획(SavingsProduct 월 계획액)이 있으면
    그것이 "얼마 저축할지"의 원본이라 **계획 대비 실제 납입액**(저축상품 연결 거래)을 비교한다. 계획을 아직
    세우지 않은 가구만 예전처럼 목표들의 월 저축액 합 대비 그 달 수입−지출로 폴백한다."""
    if planned_savings > 0:
        return deposits, planned_savings
    return surplus, goals_monthly


def goals_monthly_total(goals: list[FinancialGoal]) -> Decimal:
    """상품 계획이 없는 달의 폴백 목표치 — savings_pace_basis가 상품 계획이 0일 때만 쓰므로, 목표 월 계획액
    규칙(goal_progress_service.planned_monthly_for_goal)에 빈 상품 계획을 넘긴 값의 합이다: 상품 연동 목표는
    0(상품 계획이 원본이라 목표에 남은 옛 monthly_saving_amount를 다시 세지 않는다), 미연동 목표만 직접 입력값.
    챌린지는 저축 페이스 대상이 아니다."""
    return sum((goal_progress_service.planned_monthly_for_goal(g, {}) for g in goals if g.kind == "goal"), Decimal("0"))


def savings_pace_history(db: Session, trend: list[dict], goals: list[FinancialGoal]) -> list[tuple[Decimal, Decimal]]:
    """trend(transaction_trend_service.monthly_trend 출력, 오래된 달부터)의 각 달에 대해 savings_pace_basis를
    계산하는 DB-aware 래퍼 — 대시보드와 요약 메일이 같은 연속 달성 개월 수를 보이도록 공유한다."""
    goals_monthly = goals_monthly_total(goals)
    totals_by_month = savings_product_plan_service.plan_totals_for_months(db, [row["year_month"] for row in trend])
    history = []
    for row in trend:
        planned, deposits = totals_by_month[row["year_month"]]
        history.append(savings_pace_basis(planned, deposits, goals_monthly, row["income"] - row["expense"]))
    return history


def savings_streak_months(history: list[tuple[Decimal, Decimal]]) -> int:
    """history는 오래된 달부터 정렬된 월별 (실적, 목표) 쌍(savings_pace_basis 출력). 가장 최근 달부터
    거꾸로 훑으며 목표가 있고 실적이 목표 이상이었던 연속 개월 수를 센다 (게임화 위젯의 '연속 목표달성'
    스트릭 배지용). 목표가 없는 달을 만나면 거기서 끊는다."""
    streak = 0
    for actual, target in reversed(history):
        if target <= 0 or actual < target:
            break
        streak += 1
    return streak
