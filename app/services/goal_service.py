import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.models.financial_goal import FinancialGoal
from app.models.goal_funding_source import GoalFundingSource
from app.models.goal_monthly_target import GoalMonthlyTarget
from app.services import goal_progress_service, growlio_client, plan_targets
from app.utils.dates import now_kst


class MonthlyTargetNotFoundError(Exception):
    pass


class DuplicateFundingSourceProductError(Exception):
    pass


def fetch_growlio_goal_settings(bearer_token: str) -> dict:
    """재무목표 신규 작성 폼을 미리 채우기 위해 growlio 투자목표 설정값을 전달한다."""
    return growlio_client.fetch_investment_goal(bearer_token)


def list_goals(db: Session) -> list[FinancialGoal]:
    return db.query(FinancialGoal).order_by(FinancialGoal.priority, FinancialGoal.sort_order).all()


def get_goal(db: Session, goal_id: int) -> FinancialGoal | None:
    return db.get(FinancialGoal, goal_id)


def _apply_funding_sources(db: Session, goal: FinancialGoal, funding_sources: list[dict] | None) -> None:
    existing_by_key = {
        (fs.savings_product_id, fs.account_id, fs.loan_id): fs for fs in goal.funding_sources
    }
    new_sources: list[GoalFundingSource] = []
    seen: set[tuple[str, int]] = set()
    for item in funding_sources or []:
        source_type, source_id = item["type"], item["id"]
        key = (source_type, source_id)
        if key in seen:
            continue
        seen.add(key)
        if source_type == "savings_product":
            existing_key = (source_id, None, None)
            if existing_key not in existing_by_key:
                # 다른 목표가 이미 이 상품을 연동하고 있으면 잔액이 두 목표에 중복 집계되므로 막는다
                # (goal_funding_sources.savings_product_id unique 제약과 짝). 한 목표에 상품을
                # 여러 개 연동하는 것(부부가 각자 다른 상품으로 모으는 경우)은 계속 허용한다 —
                # 다만 그런 경우 월 계획액 자동 동기화는 적용되지 않는다(_sync_funding_product_
                # monthly_amount 참고, 어느 상품에 나눠줄지 모호하기 때문).
                conflict_query = db.query(GoalFundingSource).filter(
                    GoalFundingSource.savings_product_id == source_id
                )
                if goal.id is not None:
                    conflict_query = conflict_query.filter(GoalFundingSource.goal_id != goal.id)
                conflict = conflict_query.first()
                if conflict is not None:
                    raise DuplicateFundingSourceProductError(
                        f"'{conflict.savings_product.name}' 상품은 이미 다른 목표에 연동되어 있습니다."
                    )
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(savings_product_id=source_id))
        elif source_type == "account":
            existing_key = (None, source_id, None)
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(account_id=source_id))
        elif source_type == "loan":
            existing_key = (None, None, source_id)
            new_sources.append(existing_by_key.get(existing_key) or GoalFundingSource(loan_id=source_id))
    goal.funding_sources = new_sources


def _sync_funding_product_monthly_amount(goal: FinancialGoal) -> None:
    """연동된 저축상품이 정확히 1개일 때만 그 상품의 월 계획액을 이 목표의 월 저축액으로 맞춘다 —
    상품이 여러 개면(부부가 각자 다른 상품으로 모으는 경우) 목표의 월 저축액을 어느 상품에
    나눠줄지 모호해 자동 동기화하지 않고 각 상품은 계속 수동 입력을 받는다(SavingsProduct.
    monthly_saving_amount_synced와 판정 기준이 같다 — app/models/savings_product.py 참고)."""
    linked_products = [fs.savings_product for fs in goal.funding_sources if fs.savings_product_id is not None]
    if len(linked_products) == 1:
        linked_products[0].monthly_saving_amount = goal.monthly_saving_amount


def _apply_challenge_completion(db: Session, goal: FinancialGoal, now: datetime | None = None) -> None:
    """kind="challenge"에서만 동작 — 진행금액(goal_progress_service.compute_current_amount,
    funding_sources 연동 시 연동 잔액 합, 미연동 시 manual_current_amount)이 목표금액에 도달하면
    succeeded로 전환하고 완료 시각을 기록한다(실제 축하 알림 발송 여부는 notification_service가
    별도로 판단한다)."""
    if goal.kind != "challenge":
        return
    now = now or now_kst()
    current_amount = goal_progress_service.compute_current_amount(db, goal)
    if goal.status == "active" and goal.required_amount > 0 and current_amount >= goal.required_amount:
        goal.status = "succeeded"
        goal.completed_at = now


def create_goal(
    db: Session,
    priority: int,
    name: str,
    target_age: int | None,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    current_amount: Decimal = Decimal("0"),
    funding_sources: list[dict] | None = None,
    target_date: date | None = None,
    kind: str = "goal",
    description: str | None = None,
    start_date: date | None = None,
    created_by_id: uuid.UUID | None = None,
    monthly_targets: list[dict] | None = None,
    now: datetime | None = None,
) -> FinancialGoal:
    goal = FinancialGoal(
        priority=priority,
        name=name,
        target_age=target_age,
        target_date=target_date,
        required_amount=required_amount,
        monthly_saving_amount=monthly_saving_amount,
        manual_current_amount=current_amount,
        sort_order=DEFAULT_SORT_ORDER,
        kind=kind,
        description=description,
        start_date=start_date,
        created_by_id=created_by_id,
    )
    _apply_funding_sources(db, goal, funding_sources)
    plan_targets.apply_monthly_targets(goal, monthly_targets, GoalMonthlyTarget)
    db.add(goal)
    db.flush()  # 완료 판정(compute_current_amount)이 funding_sources 관계를 조회하려면 goal/fs가
    # 먼저 세션에 반영(pending -> flushed)되어 있어야 한다 — transient 상태에서는 관계 lazy-load가
    # 동작하지 않는다.
    _sync_funding_product_monthly_amount(goal)
    _apply_challenge_completion(db, goal, now)
    db.commit()
    db.refresh(goal)
    return goal


def update_goal(
    db: Session,
    goal_id: int,
    priority: int,
    name: str,
    target_age: int | None,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    current_amount: Decimal = Decimal("0"),
    funding_sources: list[dict] | None = None,
    target_date: date | None = None,
    description: str | None = None,
    start_date: date | None = None,
    monthly_targets: list[dict] | None = None,
    now: datetime | None = None,
) -> FinancialGoal | None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is None:
        return None
    goal.priority = priority
    goal.name = name
    goal.target_age = target_age
    goal.target_date = target_date
    goal.required_amount = required_amount
    goal.monthly_saving_amount = monthly_saving_amount
    goal.manual_current_amount = current_amount
    goal.description = description
    goal.start_date = start_date
    _apply_funding_sources(db, goal, funding_sources)
    plan_targets.apply_monthly_targets(goal, monthly_targets, GoalMonthlyTarget)
    db.flush()
    _sync_funding_product_monthly_amount(goal)
    _apply_challenge_completion(db, goal, now)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, goal_id: int) -> bool:
    """대상 목표가 있으면 삭제하고 True, 없으면 False (라우터가 404로 변환)."""
    goal = db.get(FinancialGoal, goal_id)
    if goal is None:
        return False
    db.delete(goal)
    db.commit()
    return True


def update_monthly_target_achieved(
    db: Session, goal_id: int, year_month: str, achieved_amount: Decimal
) -> FinancialGoal | None:
    """kind="goal"의 미연동 월별계획 카드에서 특정 달의 달성 금액만 가볍게 갱신한다 (챌린지의
    "진행 금액 갱신"과 동등한 부분 업데이트 — 전체 목표/월별 계획을 다시 보내지 않아도 됨)."""
    goal = db.get(FinancialGoal, goal_id)
    if goal is None:
        return None
    target = next((mt for mt in goal.monthly_targets if mt.year_month == year_month), None)
    if target is None:
        raise MonthlyTargetNotFoundError(f"{year_month}에 해당하는 월별 목표를 찾을 수 없습니다.")
    target.achieved_amount = achieved_amount
    db.commit()
    db.refresh(goal)
    return goal


def sync_challenge_statuses(db: Session, now: datetime) -> list[FinancialGoal]:
    """매일 안전망(app/scheduler/jobs.py::daily_threshold_safety_net) 전용 — 목표를 수정하지
    않아도 연동 잔액(저축상품 이자, 계좌 입금 등)이 자연히 늘어 목표액을 넘긴 challenge를
    succeeded로 전환한다. 저장 이벤트가 없으면 _apply_challenge_completion이 호출될 기회 자체가
    없다는 문제의 보완책. active 상태인 challenge만 재검사한다."""
    transitioned: list[FinancialGoal] = []
    challenges = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.kind == "challenge", FinancialGoal.status == "active")
        .all()
    )
    for goal in challenges:
        _apply_challenge_completion(db, goal, now)
        if goal.status == "succeeded":
            transitioned.append(goal)
    if transitioned:
        db.commit()
    return transitioned
