import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal
from app.models.goal_funding_source import GoalFundingSource
from app.models.goal_monthly_target import GoalMonthlyTarget
from app.models.transaction import Transaction
from app.services import account_service, growlio_client
from app.utils.dates import month_bounds, months_between, parse_year_month


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


def funding_source_breakdown(db: Session, goal: FinancialGoal) -> list[dict]:
    items: list[dict] = []
    for fs in goal.funding_sources:
        if fs.savings_product_id is not None:
            items.append(
                {
                    "type": "savings_product",
                    "id": fs.savings_product_id,
                    "name": fs.savings_product.name,
                    "amount": fs.savings_product.current_balance,
                }
            )
        elif fs.account_id is not None:
            items.append(
                {
                    "type": "account",
                    "id": fs.account_id,
                    "name": fs.account.name,
                    "amount": account_service.current_balance(db, fs.account),
                }
            )
        elif fs.loan_id is not None:
            items.append(
                {
                    "type": "loan",
                    "id": fs.loan_id,
                    "name": fs.loan.name,
                    "amount": -fs.loan.balance,
                }
            )
    return items


def _sum_breakdown_amounts(goal: FinancialGoal, breakdown: list[dict]) -> Decimal:
    """연동이 하나도 없으면 수동 입력값, 있으면 breakdown 금액 합(저축상품·계좌는 더하고 대출은
    이미 음수로 들어있어 자연히 차감된다)."""
    if not goal.funding_sources:
        return goal.manual_current_amount
    return sum((item["amount"] for item in breakdown), Decimal("0"))


def compute_current_amount(db: Session, goal: FinancialGoal) -> Decimal:
    """연동된 저축상품·계좌 잔액 합에서 연동된 대출 잔액을 뺀 값. 연동이 하나도 없으면 수동 입력값.
    kind="irregular"는 연동/수동 입력값을 쓰지 않고 monthly_targets의 achieved_amount 합이다.
    kind="goal"도 미연동이면서 monthly_targets이 있으면(월별 계획을 쓰는 신규 장기목표) 동일하게
    월별 achieved_amount 합을 쓴다 — 연동된 목표는 잔액이 이미 진실의 원천이라(월별 합산과 어긋날
    수 있음, 이자 등 거래 외 변동 포함) 그대로 두고, monthly_targets이 아예 없는 기존 목표(이
    기능 도입 전에 만든 목표)는 하위호환을 위해 manual_current_amount를 그대로 쓴다."""
    if goal.kind == "irregular":
        return sum((mt.achieved_amount for mt in goal.monthly_targets), Decimal("0"))
    if goal.kind == "goal" and not goal.funding_sources and goal.monthly_targets:
        return sum((mt.achieved_amount for mt in goal.monthly_targets), Decimal("0"))
    return _sum_breakdown_amounts(goal, funding_source_breakdown(db, goal))


def compute_linked_monthly_achieved(db: Session, goal: FinancialGoal, year_months: list[str]) -> dict[str, Decimal]:
    """연동된 저축상품/계좌로 유입된 금액을 월별로 집계해 kind="goal" 연동 목표의 '이번 달 달성액'
    자동값으로 쓴다. 대출 연동은 Transaction에 loan_id가 없어 월별로 귀속시킬 수 없으므로 집계
    대상에서 제외한다(대출 낀 목표는 이번 달 값도 계속 수동 입력을 받는다).

    저축상품 연동 거래(savings_product_id)는 항상 type="expense"로만 기록되지만(체크통장에서
    저축상품으로 돈이 나가는 지출 형태) 그 금액은 상품 잔액을 늘리는 입금이다
    (transaction_service.create_transaction -> savings_product_service.adjust_balance(+amount)와
    동일 규칙) — 그래서 income/expense와 무관하게 항상 +amount로 더한다. 계좌 연동 거래(account_id)는
    반대로 일반적인 수입=+/지출=- 규칙을 그대로 따른다(account_service.current_balance와 동일 규칙).
    한 거래가 계좌와 저축상품 양쪽에 걸려 있으면(같은 목표에 둘 다 연동된 경우, 계좌에서 상품으로
    이체) 계좌 쪽 -amount와 상품 쪽 +amount가 상쇄돼 목표 내부 이동이 이중 집계되지 않는다.

    year_months가 비었거나 연동된 저축상품/계좌가 없으면 빈 dict."""
    result = {ym: Decimal("0") for ym in year_months}
    if not year_months:
        return result
    account_ids = [fs.account_id for fs in goal.funding_sources if fs.account_id is not None]
    product_ids = [fs.savings_product_id for fs in goal.funding_sources if fs.savings_product_id is not None]
    if not account_ids and not product_ids:
        return result

    month_starts = [parse_year_month(ym) for ym in year_months]
    range_start = min(month_starts)
    range_end = month_bounds(max(month_starts))[1]

    link_filters = []
    if account_ids:
        link_filters.append(Transaction.account_id.in_(account_ids))
    if product_ids:
        link_filters.append(Transaction.savings_product_id.in_(product_ids))
    rows = (
        db.query(Transaction.transaction_date, Transaction.type, Transaction.amount, Transaction.savings_product_id)
        .filter(
            Transaction.transaction_date >= range_start,
            Transaction.transaction_date <= range_end,
            or_(*link_filters),
        )
        .all()
    )
    for tx_date, tx_type, amount, savings_product_id in rows:
        ym = tx_date.strftime("%Y-%m")
        if ym not in result:
            continue
        amount = amount or Decimal("0")
        if savings_product_id is not None and savings_product_id in product_ids:
            result[ym] += amount
        else:
            result[ym] += amount if tx_type == "income" else -amount
    return result


def sum_monthly_targets(monthly_targets: list[dict] | None) -> Decimal:
    return sum((item["target_amount"] for item in monthly_targets or []), Decimal("0"))


def compute_progress_pct(current_amount: Decimal, required_amount: Decimal) -> Decimal:
    if not required_amount:
        return Decimal("0")
    return min(current_amount / required_amount * 100, Decimal("100"))


def effective_status(goal: FinancialGoal, today: date | None = None) -> str | None:
    """kind="challenge"에서만 의미 있는 표시용 상태 — 저장된 status에 'expired'(기간 종료 +
    미달성)를 얹어 매번 계산한다(스케줄러 job 없이도 항상 정확). 일반 목표(kind="goal")는 None."""
    if goal.kind != "challenge":
        return None
    today = today or date.today()
    if goal.status == "active" and goal.target_date is not None and today > goal.target_date:
        return "expired"
    return goal.status


def compute_months_remaining(today: date, target_date: date | None) -> int | None:
    if target_date is None:
        return None
    return max(0, months_between(today, target_date))


def compute_suggested_monthly_amount(
    current_amount: Decimal, required_amount: Decimal, months_remaining: int | None
) -> Decimal | None:
    if not months_remaining:
        return None
    return max(Decimal("0"), (required_amount - current_amount) / months_remaining)


# compute_projected_months_with_growth의 개월수 탐색 상한(50년) — 이보다 오래 걸리면 도달 불가로 본다.
MAX_PROJECTION_MONTHS = 600


def compute_weighted_return_rate_pct(goal: FinancialGoal) -> Decimal | None:
    """목표에 연동된 투자형 저축상품들의 잔액 가중평균 수익률(원금 대비 손익률,
    SavingsProduct.return_rate_pct). 연동된 투자 상품이 없거나 전부 원금 미입력이라 수익률을
    계산할 수 없으면 None."""
    total_balance = Decimal("0")
    weighted_sum = Decimal("0")
    for fs in goal.funding_sources:
        if fs.savings_product_id is None:
            continue
        product = fs.savings_product
        if product.product_type != "investment" or product.return_rate_pct is None:
            continue
        total_balance += product.current_balance
        weighted_sum += product.current_balance * product.return_rate_pct
    if total_balance <= 0:
        return None
    return weighted_sum / total_balance


def compute_projected_months_with_growth(
    current_amount: Decimal,
    monthly_saving_amount: Decimal,
    required_amount: Decimal,
    assumed_annual_return_pct: Decimal,
) -> int | None:
    """월 저축금액과 가정 연 수익률(월 복리 재투자 가정)로 목표금액에 도달하는 데 걸리는
    예상 개월수를 계산한다. 이미 달성했으면 0, 저축도 없고 자산도 없어 영원히 도달 못 하면
    None. assumed_annual_return_pct는 원금 대비 현재 손익률을 그대로 연 수익률처럼 가정한
    값이라 보유기간에 따라 실제 연환산 수익률과 다를 수 있다 — 어디까지나 추정치다."""
    if required_amount <= current_amount:
        return 0
    if current_amount <= 0 and monthly_saving_amount <= 0:
        return None
    monthly_rate = assumed_annual_return_pct / Decimal("100") / Decimal("12")
    balance = current_amount
    for month in range(1, MAX_PROJECTION_MONTHS + 1):
        balance = balance * (1 + monthly_rate) + monthly_saving_amount
        if balance >= required_amount:
            return month
    return None


def to_out(db: Session, goal: FinancialGoal, today: date) -> dict:
    breakdown = [] if goal.kind == "irregular" else funding_source_breakdown(db, goal)
    current_amount = compute_current_amount(db, goal)
    months_remaining = compute_months_remaining(today, goal.target_date)
    is_linked_goal = goal.kind == "goal" and bool(goal.funding_sources)
    linked_monthly_achieved = (
        compute_linked_monthly_achieved(db, goal, [mt.year_month for mt in goal.monthly_targets])
        if is_linked_goal
        else {}
    )
    weighted_return_rate_pct = compute_weighted_return_rate_pct(goal)
    projected_months_with_growth = (
        compute_projected_months_with_growth(
            current_amount, goal.monthly_saving_amount, goal.required_amount, weighted_return_rate_pct
        )
        if weighted_return_rate_pct is not None
        else None
    )
    return {
        "id": goal.id,
        "kind": goal.kind,
        "priority": goal.priority,
        "name": goal.name,
        "description": goal.description,
        "target_age": goal.target_age,
        "target_date": goal.target_date,
        "required_amount": goal.required_amount,
        "monthly_saving_amount": goal.monthly_saving_amount,
        "current_amount": current_amount,
        "progress_pct": compute_progress_pct(current_amount, goal.required_amount),
        "sort_order": goal.sort_order,
        "funding_sources": breakdown,
        "months_remaining": months_remaining,
        "suggested_monthly_amount": compute_suggested_monthly_amount(
            current_amount, goal.required_amount, months_remaining
        ),
        "weighted_return_rate_pct": weighted_return_rate_pct,
        "projected_months_with_growth": projected_months_with_growth,
        "start_date": goal.start_date,
        "status": goal.status,
        "effective_status": effective_status(goal, today),
        "created_by_id": goal.created_by_id,
        "completed_at": goal.completed_at,
        "monthly_targets": [
            {
                "year_month": mt.year_month,
                "target_amount": mt.target_amount,
                "achieved_amount": (
                    linked_monthly_achieved.get(mt.year_month, Decimal("0"))
                    if is_linked_goal
                    else mt.achieved_amount
                ),
                "is_achieved": (
                    linked_monthly_achieved.get(mt.year_month, Decimal("0")) >= mt.target_amount
                    if is_linked_goal
                    else mt.achieved_amount >= mt.target_amount
                ),
                "is_auto_computed": is_linked_goal,
            }
            for mt in goal.monthly_targets
        ],
    }


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
    monthly_saving_amount_synced와 판정 기준이 같다 — app/models/savings_product.py 참고).
    kind="irregular"는 funding_sources를 쓰지 않으므로 대상이 아니다."""
    if goal.kind == "irregular":
        return
    linked_products = [fs.savings_product for fs in goal.funding_sources if fs.savings_product_id is not None]
    if len(linked_products) == 1:
        linked_products[0].monthly_saving_amount = goal.monthly_saving_amount


def _apply_monthly_targets(goal: FinancialGoal, monthly_targets: list[dict] | None) -> None:
    """year_month로 기존 행을 매칭해 target_amount만 갱신(achieved_amount는 보존)하고, 새 월은
    achieved_amount=0으로 생성한다. 빠진 월은 목록에서 제외돼 delete-orphan으로 삭제된다 —
    _apply_funding_sources와 동일한 패턴(app/services/CLAUDE.md 관례 준수)."""
    existing_by_month = {mt.year_month: mt for mt in goal.monthly_targets}
    new_targets: list[GoalMonthlyTarget] = []
    for item in monthly_targets or []:
        year_month = item["year_month"]
        existing = existing_by_month.get(year_month)
        if existing is not None:
            existing.target_amount = item["target_amount"]
            new_targets.append(existing)
        else:
            new_targets.append(GoalMonthlyTarget(year_month=year_month, target_amount=item["target_amount"]))
    goal.monthly_targets = new_targets


def _apply_challenge_completion(db: Session, goal: FinancialGoal, now: datetime | None = None) -> None:
    """kind="challenge"에서만 동작 — 진행금액(compute_current_amount, funding_sources 연동 시
    연동 잔액 합, 미연동 시 manual_current_amount)이 목표금액에 도달하면 succeeded로 전환하고
    완료 시각을 기록한다(실제 축하 알림 발송 여부는 notification_service가 별도로 판단한다)."""
    if goal.kind != "challenge":
        return
    now = now or datetime.now()
    current_amount = compute_current_amount(db, goal)
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
    if kind == "irregular":
        required_amount = sum_monthly_targets(monthly_targets)
    goal = FinancialGoal(
        priority=priority,
        name=name,
        target_age=target_age,
        target_date=target_date,
        required_amount=required_amount,
        monthly_saving_amount=monthly_saving_amount,
        manual_current_amount=current_amount,
        sort_order=999,
        kind=kind,
        description=description,
        start_date=start_date,
        created_by_id=created_by_id,
    )
    _apply_funding_sources(db, goal, funding_sources)
    _apply_monthly_targets(goal, monthly_targets)
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
    if goal.kind == "irregular":
        required_amount = sum_monthly_targets(monthly_targets)
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
    _apply_monthly_targets(goal, monthly_targets)
    db.flush()
    _sync_funding_product_monthly_amount(goal)
    _apply_challenge_completion(db, goal, now)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, goal_id: int) -> None:
    goal = db.get(FinancialGoal, goal_id)
    if goal is not None:
        db.delete(goal)
        db.commit()


def update_monthly_target_achieved(
    db: Session, goal_id: int, year_month: str, achieved_amount: Decimal
) -> FinancialGoal | None:
    """kind="irregular" 목표 카드에서 특정 달의 달성 금액만 가볍게 갱신한다 (챌린지의
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


def sync_challenge_statuses(db: Session, now: datetime | None = None) -> list[FinancialGoal]:
    """매일 안전망(app/scheduler/jobs.py::daily_threshold_safety_net) 전용 — 목표를 수정하지
    않아도 연동 잔액(저축상품 이자, 계좌 입금 등)이 자연히 늘어 목표액을 넘긴 challenge를
    succeeded로 전환한다. 저장 이벤트가 없으면 _apply_challenge_completion이 호출될 기회 자체가
    없다는 문제의 보완책. active 상태인 challenge만 재검사한다."""
    now = now or datetime.now()
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
