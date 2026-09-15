from datetime import date
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal
from app.models.transaction import Transaction
from app.services import account_service
from app.utils.dates import month_bounds, months_between, parse_year_month, shift_month, year_month_str


def funding_source_breakdown(db: Session, goal: FinancialGoal) -> list[dict]:
    account_ids = [fs.account_id for fs in goal.funding_sources if fs.account_id is not None]
    account_balances = account_service.balances_for(db, account_ids)

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


def compute_current_amount(db: Session, goal: FinancialGoal) -> Decimal:
    """연동된 저축상품·계좌 잔액 합에서 연동된 대출 잔액을 뺀 값. 연동이 하나도 없으면 수동 입력값.
    kind="goal"이 미연동이면서 monthly_targets이 있으면(월별 계획을 쓰는 신규 장기목표) 월별
    achieved_amount 합을 쓴다 — 연동된 목표는 잔액이 이미 진실의 원천이라(월별 합산과 어긋날
    수 있음, 이자 등 거래 외 변동 포함) 그대로 두고, monthly_targets이 아예 없는 기존 목표(이
    기능 도입 전에 만든 목표)는 하위호환을 위해 manual_current_amount를 그대로 쓴다."""
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
    return max(Decimal("0"), (required_amount - current_amount) / months_remaining)


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


def compute_ahead_behind_months(eta_year_month: str | None, target_date: date | None) -> int | None:
    """예상 도달 달이 목표일보다 얼마나 이른지/늦은지(개월). 양수 = 그만큼 빠름, 음수 = 늦음.
    목표일이나 ETA가 없으면 None."""
    if eta_year_month is None or target_date is None:
        return None
    return months_between(parse_year_month(eta_year_month), month_bounds(target_date)[0])


def to_out(db: Session, goal: FinancialGoal, today: date) -> dict:
    breakdown = funding_source_breakdown(db, goal)
    current_amount = current_amount_from_breakdown(goal, breakdown)
    months_remaining = compute_months_remaining(today, goal.target_date)
    is_linked_goal = goal.kind == "goal" and bool(goal.funding_sources)
    linked_monthly_achieved = (
        compute_linked_monthly_achieved(db, goal, [mt.year_month for mt in goal.monthly_targets])
        if is_linked_goal
        else {}
    )
    eta_year_month = compute_eta_year_month(
        today, current_amount, goal.required_amount, goal.monthly_saving_amount
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
