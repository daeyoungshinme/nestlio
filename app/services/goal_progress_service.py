from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal
from app.models.transaction import Transaction
from app.services import (
    account_service,
    combined_goal_service,
    net_worth_service,
    real_estate_service,
    savings_product_plan_service,
)
from app.utils.dates import month_bounds, months_between, parse_year_month, shift_month, span_bounds, year_month_str
from app.utils.money import whole_won


def _linked_account_ids(goal: FinancialGoal) -> list[int]:
    return [fs.account_id for fs in goal.funding_sources if fs.account_id is not None]


def _linked_product_ids(goal: FinancialGoal) -> list[int]:
    return [fs.savings_product_id for fs in goal.funding_sources if fs.savings_product_id is not None]


def funding_source_breakdown(
    db: Session, goal: FinancialGoal, account_balances: dict[int, Decimal] | None = None
) -> list[dict]:
    """account_balances를 넘기면(목표 여러 개를 한 번에 계산하는 _Prefetched) 계좌 잔액을 다시 조회하지 않는다."""
    if account_balances is None:
        account_balances = account_service.balances_for(db, _linked_account_ids(goal))

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
                    "amount": account_balances[fs.account_id],
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


def current_amount_from_breakdown(goal: FinancialGoal, breakdown: list[dict]) -> Decimal:
    """compute_current_amount의 본체 — 이미 계산한 breakdown을 재사용한다(to_out이 breakdown을
    두 번 계산하지 않도록)."""
    if goal.kind == "goal" and not goal.funding_sources and goal.monthly_targets:
        return sum((mt.achieved_amount for mt in goal.monthly_targets), Decimal("0"))
    return _sum_breakdown_amounts(goal, breakdown)


def net_worth_now(db: Session, exclude_real_estate: bool = False) -> Decimal:
    """순자산 목표의 진행금액 — 가구 순자산, "부동산 제외"면 부동산과 그 짝 담보대출 순액을 뺀 값."""
    net_worth = net_worth_service.compute_current(db)["net_worth"]
    return net_worth - real_estate_service.real_estate_net(db) if exclude_real_estate else net_worth


def compute_current_amount(db: Session, goal: FinancialGoal) -> Decimal:
    """연동된 저축상품·계좌 잔액 합에서 연동된 대출 잔액을 뺀 값. 연동이 하나도 없으면 수동 입력값.
    kind="goal"이 미연동이면서 monthly_targets이 있으면(월별 계획을 쓰는 신규 장기목표) 월별
    achieved_amount 합을 쓴다 — 연동된 목표는 잔액이 이미 진실의 원천이라(월별 합산과 어긋날
    수 있음, 이자 등 거래 외 변동 포함) 그대로 두고, monthly_targets이 아예 없는 기존 목표(이
    기능 도입 전에 만든 목표)는 하위호환을 위해 manual_current_amount를 그대로 쓴다.
    kind="net_worth"는 가구 순자산 전체(exclude_real_estate면 부동산 순액 제외)."""
    if goal.kind == "net_worth":
        return net_worth_now(db, goal.exclude_real_estate)
    if goal.kind == combined_goal_service.KIND:
        return _combined_parts(db, goal, _prefetch(db, [goal], include_linked_rows=False), {})["current_amount"]
    return current_amount_from_breakdown(goal, funding_source_breakdown(db, goal))


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

    year_months가 비었거나 연동된 저축상품/계좌가 없으면 0으로 채운 dict."""
    return _bucket_linked_rows(goal, year_months, _linked_transaction_rows(db, [goal], year_months))


def _linked_transaction_rows(db: Session, goals: list[FinancialGoal], year_months: list[str]) -> list:
    """목표들에 연동된 계좌·저축상품의 거래를 year_months 범위에서 한 번에 가져온다 — 목표마다 조회하면
    목표 목록이 N+1이 된다. 행을 어느 목표에 귀속할지는 _bucket_linked_rows가 정한다."""
    account_ids = {aid for goal in goals for aid in _linked_account_ids(goal)}
    product_ids = {pid for goal in goals for pid in _linked_product_ids(goal)}
    month_starts = [parse_year_month(ym) for ym in year_months]
    if not month_starts or not (account_ids or product_ids):
        return []

    link_filters = []
    if account_ids:
        link_filters.append(Transaction.account_id.in_(account_ids))
    if product_ids:
        link_filters.append(Transaction.savings_product_id.in_(product_ids))
    return (
        db.query(
            Transaction.transaction_date,
            Transaction.type,
            Transaction.amount,
            Transaction.account_id,
            Transaction.savings_product_id,
        )
        .filter(
            Transaction.transaction_date.between(*span_bounds(month_starts)),
            or_(*link_filters),
        )
        .all()
    )


def _bucket_linked_rows(goal: FinancialGoal, year_months: list[str], rows: list) -> dict[str, Decimal]:
    """compute_linked_monthly_achieved의 집계 규칙. rows에는 다른 목표 몫이 섞여 있을 수 있어 이 목표에
    연동된 계좌·상품의 거래만 고른다."""
    result = {ym: Decimal("0") for ym in year_months}
    account_ids = set(_linked_account_ids(goal))
    product_ids = set(_linked_product_ids(goal))
    for tx_date, tx_type, amount, account_id, savings_product_id in rows:
        if account_id not in account_ids and savings_product_id not in product_ids:
            continue
        ym = year_month_str(tx_date)
        if ym not in result:
            continue
        amount = amount or Decimal("0")
        if savings_product_id is not None and savings_product_id in product_ids:
            result[ym] += amount
        else:
            result[ym] += amount if tx_type == "income" else -amount
    return result


def compute_progress_pct(current_amount: Decimal, required_amount: Decimal) -> Decimal:
    if not required_amount:
        return Decimal("0")
    return min(current_amount / required_amount * 100, Decimal("100"))


def effective_status(goal: FinancialGoal, today: date) -> str | None:
    """kind="challenge"에서만 의미 있는 표시용 상태 — 저장된 status에 'expired'(기간 종료 +
    미달성)를 얹어 매번 계산한다(스케줄러 job 없이도 항상 정확). 일반 목표(kind="goal")는 None."""
    if goal.kind != "challenge":
        return None
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
    return whole_won(max(Decimal("0"), (required_amount - current_amount) / months_remaining))


def compute_eta_year_month(
    today: date, current_amount: Decimal, required_amount: Decimal, monthly_saving_amount: Decimal
) -> str | None:
    """현재 저축 속도(월 저축금액)로 목표금액에 도달하는 예상 달("YYYY-MM"). 이미 달성했으면
    이번 달, 월 저축금액이 없어 영원히 못 미치면 None. 복리·수익률을 가정하지 않는 단순 선형
    계산이다 — 옛 50년 복리 프로젝션(제거됨)을 대체한다."""
    if required_amount <= current_amount:
        return year_month_str(today)
    if monthly_saving_amount <= 0:
        return None
    remaining = required_amount - current_amount
    # 정수 나눗셈 후 나머지가 있으면 한 달 더 — Decimal //는 0쪽으로 절삭하므로 divmod로 올림한다.
    whole, rem = divmod(remaining, monthly_saving_amount)
    months = int(whole) + (1 if rem > 0 else 0)
    return year_month_str(shift_month(today, months))


MAX_PROJECTION_MONTHS = 600


def compute_eta_with_return(
    today: date,
    current_amount: Decimal,
    required_amount: Decimal,
    monthly_saving_amount: Decimal,
    annual_return_pct: Decimal | None,
) -> str | None:
    """기대 연수익률을 월 복리로 적용했을 때 목표금액에 도달하는 예상 달("YYYY-MM"). 매달 말 잔액에 월 수익률을
    곱하고 월 저축액을 더한다. 수익률이 없으면 None(선형 ETA만 쓴다), 이미 달성했으면 이번 달, 50년 안에 못
    닿으면 None — 옛 무제한 복리 프로젝션을 없앴던 이유(비현실적 먼 미래 날짜)를 상한으로 막는다."""
    # −100% 이하면 (1 + r)이 0 이하라 월 수익률(12제곱근)이 정의되지 않는다 — 복리 ETA를 내지 않는다.
    if annual_return_pct is None or annual_return_pct <= Decimal("-100"):
        return None
    if required_amount <= current_amount:
        return year_month_str(today)
    monthly_rate = (Decimal("1") + annual_return_pct / Decimal("100")) ** (Decimal("1") / Decimal("12")) - Decimal("1")
    balance = max(current_amount, Decimal("0"))
    for month in range(1, MAX_PROJECTION_MONTHS + 1):
        balance = balance * (Decimal("1") + monthly_rate) + monthly_saving_amount
        if balance >= required_amount:
            return year_month_str(shift_month(today, month))
    return None


def compute_ahead_behind_months(eta_year_month: str | None, target_date: date | None) -> int | None:
    """예상 도달 달이 목표일보다 얼마나 이른지/늦은지(개월). 양수 = 그만큼 빠름, 음수 = 늦음.
    목표일이나 ETA가 없으면 None."""
    if eta_year_month is None or target_date is None:
        return None
    return months_between(parse_year_month(eta_year_month), month_bounds(target_date)[0])


def planned_monthly_for_goal(goal: FinancialGoal, planned_by_product: dict[int, Decimal]) -> Decimal:
    """목표의 실제 월 계획액. 저축·투자 상품이 연동된 목표는 그 상품들의 이번 달 계획액 합(계획 원본은
    SavingsProduct 월 계획 — savings_product_plan_service.planned_by_product_for_month)이고, 상품 연동이 없는
    목표만 목표에 직접 입력한 monthly_saving_amount를 쓴다. kind="net_worth"는 가구 전체가 자금원이라 모든
    저축·투자 상품의 그 달 계획 합(계획 탭 저축·투자 섹션 합계와 같은 값)이다."""
    if goal.kind == "net_worth":
        return sum(planned_by_product.values(), Decimal("0"))
    product_ids = [fs.savings_product_id for fs in goal.funding_sources if fs.savings_product_id is not None]
    if not product_ids:
        return goal.monthly_saving_amount
    return sum((planned_by_product.get(pid, Decimal("0")) for pid in product_ids), Decimal("0"))


@dataclass
class _Prefetched:
    """목표 여러 개의 진행금액 계산에 필요한 조회를 목표 수와 무관하게 한 번씩 해 둔 것 — 계좌 잔액,
    연동 목표의 월별 거래(목록 응답만), 순자산(순자산 목표가 있을 때만), growlio 목표 저장값(통합 목표가 있을 때만)."""

    account_balances: dict[int, Decimal]
    linked_rows: list = field(default_factory=list)
    net_worth: Decimal | None = None
    # 순자산 목표 중 "부동산 제외"가 있을 때만 — 부동산 상품 잔액 − 짝 담보대출(real_estate_service.real_estate_net).
    real_estate_net: Decimal = Decimal("0")
    snapshots: dict = field(default_factory=dict)

    def net_worth_for(self, goal: FinancialGoal) -> Decimal:
        return self.net_worth - self.real_estate_net if goal.exclude_real_estate else self.net_worth


def _is_linked_goal(goal: FinancialGoal) -> bool:
    return goal.kind == "goal" and bool(goal.funding_sources)


def _member_goals(goals: list[FinancialGoal]) -> list[FinancialGoal]:
    return [
        m.member_goal
        for goal in goals
        if goal.kind == combined_goal_service.KIND
        for m in goal.combined_members
        if m.member_goal is not None
    ]


def _prefetch(db: Session, goals: list[FinancialGoal], include_linked_rows: bool) -> _Prefetched:
    linked_goals = [goal for goal in goals if _is_linked_goal(goal)] if include_linked_rows else []
    # 통합 목표의 구성 목표 계좌도 같이 — 상세(to_out 단건)는 구성 목표가 goals에 없다.
    balance_goals = goals + _member_goals(goals)
    has_combined = any(goal.kind == combined_goal_service.KIND for goal in goals)
    return _Prefetched(
        account_balances=account_service.balances_for(
            db, sorted({aid for goal in balance_goals for aid in _linked_account_ids(goal)})
        ),
        linked_rows=_linked_transaction_rows(
            db, linked_goals, [mt.year_month for goal in linked_goals for mt in goal.monthly_targets]
        ),
        net_worth=net_worth_now(db) if any(goal.kind == "net_worth" for goal in goals) else None,
        real_estate_net=(
            real_estate_service.real_estate_net(db)
            if any(goal.kind == "net_worth" and goal.exclude_real_estate for goal in goals)
            else Decimal("0")
        ),
        snapshots=combined_goal_service.active_snapshots(db) if has_combined else {},
    )


def _overlapping_sources(goal: FinancialGoal, growlio_user_ids: set) -> list[tuple[str, int]]:
    """구성 목표의 자금원 중 growlio 투자자산에 이미 들어 있는 것 — growlio 계좌를 가져온 저축·투자 상품·계좌이고 그
    growlio 목표가 통합 목표에 합산되는 사람 소유. 부동산은 growlio 목표 기준(부동산 제외)에 없으므로 겹치지 않는다(지금은
    자금원으로 연동할 수 없지만 — goal_service.RealEstateFundingSourceError — 방어로 남긴다)."""
    keys: list[tuple[str, int]] = []
    for fs in goal.funding_sources:
        product, account = fs.savings_product, fs.account
        if (
            product is not None
            and product.growlio_account_id
            and product.product_type != "real_estate"
            and product.owner_user_id in growlio_user_ids
        ):
            keys.append(("savings_product", product.id))
        elif account is not None and account.growlio_account_id and account.owner_user_id in growlio_user_ids:
            keys.append(("account", account.id))
    return keys


def _combined_parts(
    db: Session, goal: FinancialGoal, prefetched: _Prefetched, planned_by_product: dict[int, Decimal]
) -> dict:
    """통합 목표의 구성별 값과 합계. 현재금액 = 구성 목표 현재금액 합 + growlio 투자자산 합 − 겹침(growlio 투자자산에
    이미 잡힌 구성 목표 자금원), 월 계획 = 구성 목표 월 계획 합 + growlio 월 적립액 합 − 겹친 상품의 월 계획.
    growlio 값이 아직 저장 전이거나 growlio에 목표가 없으면 그 구성은 금액 None(합계에서 빠짐)."""
    snapshots = prefetched.snapshots
    counted = {
        m.growlio_user_id: snap
        for m in goal.combined_members
        if (snap := combined_goal_service.counted_snapshot(m, snapshots)) is not None
        and snap.investable_assets is not None
    }
    members: list[dict] = []
    current = planned = overlap = overlap_planned = Decimal("0")
    for m in goal.combined_members:
        if m.member_goal is not None:
            mg = m.member_goal
            breakdown = funding_source_breakdown(db, mg, prefetched.account_balances)
            member_current = current_amount_from_breakdown(mg, breakdown)
            amounts = {(item["type"], item["id"]): item["amount"] for item in breakdown}
            for key in _overlapping_sources(mg, set(counted)):
                overlap += amounts.get(key, Decimal("0"))
                if key[0] == "savings_product":
                    overlap_planned += planned_by_product.get(key[1], Decimal("0"))
            current += member_current
            planned += planned_monthly_for_goal(mg, planned_by_product)
            members.append(
                {
                    "type": "goal",
                    "goal_id": mg.id,
                    "user_id": None,
                    "name": mg.name,
                    "current_amount": member_current,
                    "required_amount": mg.required_amount,
                    "progress_pct": compute_progress_pct(member_current, mg.required_amount),
                    "synced_at": None,
                    "growlio": None,
                }
            )
        elif m.growlio_user_id is not None:
            snap = snapshots.get(m.growlio_user_id)
            user_counted = m.growlio_user_id in counted
            if user_counted:
                current += snap.investable_assets
                planned += snap.monthly_deposit_amount or Decimal("0")
            configured = snap is not None and snap.is_configured
            members.append(
                {
                    "type": "growlio",
                    "goal_id": None,
                    "user_id": m.growlio_user_id,
                    "name": f"{m.growlio_user.display_name}의 growlio 투자목표",
                    "current_amount": snap.investable_assets if user_counted else None,
                    "required_amount": snap.goal_amount if configured else None,
                    "progress_pct": (
                        compute_progress_pct(snap.investable_assets, snap.goal_amount or Decimal("0"))
                        if user_counted
                        else None
                    ),
                    "synced_at": snap.synced_at if snap is not None else None,
                    "growlio": snap,
                }
            )
    return {
        "members": members,
        "current_amount": current - overlap,
        "planned_monthly": max(planned - overlap_planned, Decimal("0")),
        "overlap_amount": overlap,
    }


def current_amounts(db: Session, goals: list[FinancialGoal]) -> dict[int, Decimal]:
    """목표 id → compute_current_amount 값. 목표 수와 무관한 쿼리 수로 계산한다(마일스톤 일괄 확인용)."""
    prefetched = _prefetch(db, goals, include_linked_rows=False)
    amounts: dict[int, Decimal] = {}
    for goal in goals:
        if goal.kind == "net_worth":
            amounts[goal.id] = prefetched.net_worth_for(goal)
        elif goal.kind == combined_goal_service.KIND:
            amounts[goal.id] = _combined_parts(db, goal, prefetched, {})["current_amount"]
        else:
            amounts[goal.id] = current_amount_from_breakdown(
                goal, funding_source_breakdown(db, goal, prefetched.account_balances)
            )
    return amounts


def list_out(db: Session, goals: list[FinancialGoal], today: date) -> list[dict]:
    """목표 목록 응답. 상품별 이번 달 계획액·계좌 잔액·연동 거래·순자산은 목표마다 조회하지 않고 한 번만
    가져와 모든 목표가 나눠 쓴다(쿼리 수가 목표 수와 무관 — tests/test_goal_service.py가 고정)."""
    planned_by_product = savings_product_plan_service.planned_by_product_for_month(db, year_month_str(today))
    prefetched = _prefetch(db, goals, include_linked_rows=True)
    return [to_out(db, goal, today, planned_by_product=planned_by_product, prefetched=prefetched) for goal in goals]


def to_out(
    db: Session,
    goal: FinancialGoal,
    today: date,
    planned_by_product: dict[int, Decimal] | None = None,
    prefetched: _Prefetched | None = None,
) -> dict:
    if prefetched is None:
        prefetched = _prefetch(db, [goal], include_linked_rows=True)
    breakdown = funding_source_breakdown(db, goal, prefetched.account_balances)
    if planned_by_product is None:
        planned_by_product = savings_product_plan_service.planned_by_product_for_month(db, year_month_str(today))
    combined = (
        _combined_parts(db, goal, prefetched, planned_by_product) if goal.kind == combined_goal_service.KIND else None
    )
    if combined is not None:
        planned_monthly, current_amount = combined["planned_monthly"], combined["current_amount"]
    else:
        planned_monthly = planned_monthly_for_goal(goal, planned_by_product)
        current_amount = (
            prefetched.net_worth_for(goal) if goal.kind == "net_worth" else current_amount_from_breakdown(goal, breakdown)
        )
    months_remaining = compute_months_remaining(today, goal.target_date)
    is_linked_goal = _is_linked_goal(goal)
    linked_monthly_achieved = (
        _bucket_linked_rows(goal, [mt.year_month for mt in goal.monthly_targets], prefetched.linked_rows)
        if is_linked_goal
        else {}
    )
    eta_year_month = compute_eta_year_month(today, current_amount, goal.required_amount, planned_monthly)
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
        "planned_monthly_amount": planned_monthly,
        "expected_annual_return_pct": goal.expected_annual_return_pct,
        "eta_with_return_year_month": compute_eta_with_return(
            today, current_amount, goal.required_amount, planned_monthly, goal.expected_annual_return_pct
        ),
        "current_amount": current_amount,
        "progress_pct": compute_progress_pct(current_amount, goal.required_amount),
        "sort_order": goal.sort_order,
        "funding_sources": breakdown,
        "combined_members": combined["members"] if combined is not None else [],
        "overlap_amount": combined["overlap_amount"] if combined is not None else None,
        "exclude_real_estate": goal.exclude_real_estate,
        "months_remaining": months_remaining,
        "suggested_monthly_amount": compute_suggested_monthly_amount(
            current_amount, goal.required_amount, months_remaining
        ),
        "eta_year_month": eta_year_month,
        "ahead_behind_months": compute_ahead_behind_months(eta_year_month, goal.target_date),
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
