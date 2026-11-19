import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.errors import ConflictError, InvalidInputError, PartialFailureError
from app.models.recurring_expense import RecurringExpense
from app.models.savings_product import SavingsProduct
from app.models.transaction import Transaction
from app.services.transaction_service import create_transaction, validate_category_kind, validate_savings_link
from app.utils.dates import advance_recurring_date, first_monthly_date_on_or_after, today_kst

logger = logging.getLogger(__name__)

# 일정을 바꾼 뒤 다음 기한을 다시 셀 때·재활성화 때 앞당기는 최대 횟수(주 단위 약 4.6년, 월 단위 20년).
_ADVANCE_GUARD = 240
# 바꾸면 다음 기한을 다시 계산해야 하는 일정 칸.
_SCHEDULE_FIELDS = ("frequency", "start_date", "days_of_month")


class RecurringSavingsProductError(InvalidInputError):
    """연결할 저축상품이 없거나 비활성 — 그대로 두면 매달 자동 생성이 실패한다."""


def _validate_savings_product(db: Session, category_id: int, type_: str, savings_product_id: int | None) -> None:
    validate_savings_link(db, category_id, type_, savings_product_id)
    if savings_product_id is None:
        return
    product = db.get(SavingsProduct, savings_product_id)
    if product is None or not product.is_active:
        raise RecurringSavingsProductError("저축상품을 찾을 수 없습니다.")


class RecurringEndedError(ConflictError):
    """종료일이 지나 더 이상 기한이 없는 고정지출 — 재활성화해도 다음 생성 때 바로 다시 꺼진다."""


def _first_due_date(start_date: date, days_of_month: list[int] | None) -> date:
    """create_recurring의 첫 기한 규칙 — 여러 날짜(days_of_month)면 시작일 이후 첫 지정일, 아니면 시작일."""
    return first_monthly_date_on_or_after(start_date, days_of_month) if days_of_month else start_date


def _advance_until(db: Session, recurring: RecurringExpense, due: date, today: date) -> date:
    """`due`를 오늘 이후의, 아직 거래가 생성되지 않은 기한까지 앞당긴다 — 소급분을 한꺼번에 만들거나 오늘 이미 만든
    기한을 다시 만들지 않게."""
    generated = {
        tx_date
        for (tx_date,) in db.query(Transaction.transaction_date).filter(
            Transaction.recurring_expense_id == recurring.id, Transaction.transaction_date >= today
        )
    }
    guard = 0
    while (due < today or due in generated) and guard < _ADVANCE_GUARD:
        guard += 1
        due = advance_recurring_date(due, recurring.frequency, recurring.day_of_month, recurring.days_of_month)
    return due


def list_recurring(db: Session, active_only: bool = True) -> list[RecurringExpense]:
    query = db.query(RecurringExpense)
    if active_only:
        query = query.filter(RecurringExpense.is_active.is_(True))
    return query.order_by(RecurringExpense.next_due_date).all()


def upcoming(db: Session, within_days: int = 14, today: date | None = None) -> list[RecurringExpense]:
    today = today or today_kst()
    horizon = today + timedelta(days=within_days)
    return (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.next_due_date <= horizon,
        )
        .order_by(RecurringExpense.next_due_date)
        .all()
    )


def due_in_range(db: Session, range_start: date, range_end: date) -> list[RecurringExpense]:
    """Active recurring expenses whose next scheduled due date falls within [range_start, range_end].
    Used to surface upcoming fixed-cost due dates on the shared calendar."""
    return (
        db.query(RecurringExpense)
        .filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.next_due_date >= range_start,
            RecurringExpense.next_due_date <= range_end,
        )
        .order_by(RecurringExpense.next_due_date)
        .all()
    )


def create_recurring(
    db: Session,
    name: str,
    category_id: int,
    amount: Decimal,
    frequency: str,
    start_date: date,
    created_by: uuid.UUID,
    end_date: date | None = None,
    reminder_days_before: int = 3,
    type_: str = "expense",
    days_of_month: list[int] | None = None,
    savings_product_id: int | None = None,
) -> RecurringExpense:
    # 어긋난 채 등록되면 generate_due_transactions가 예외를 삼키고 매번 거래를 만들지 못한다.
    validate_category_kind(db, category_id, type_)
    _validate_savings_product(db, category_id, type_, savings_product_id)
    day_of_month = min(days_of_month) if days_of_month else start_date.day
    next_due_date = first_monthly_date_on_or_after(start_date, days_of_month) if days_of_month else start_date
    recurring = RecurringExpense(
        name=name,
        category_id=category_id,
        amount=amount,
        type=type_,
        frequency=frequency,
        day_of_month=day_of_month,
        days_of_month=days_of_month,
        start_date=start_date,
        end_date=end_date,
        reminder_days_before=reminder_days_before,
        next_due_date=next_due_date,
        created_by=created_by,
        is_active=True,
        savings_product_id=savings_product_id,
    )
    db.add(recurring)
    db.commit()
    db.refresh(recurring)
    return recurring


def update_recurring(db: Session, recurring_id: int, today: date | None = None, **fields) -> RecurringExpense | None:
    """일정(주기·시작일·지정일)을 바꾸면 다음 기한을 새 일정으로 다시 계산한다(오늘 이후, 이미 만든 기한 제외) —
    그대로 두면 매달 25일 → 5일로 바꿔도 이번 달 25일에 한 번 더 생성되고, 시작일을 미래로 옮겨도 예전 기한에 생겼다."""
    today = today or today_kst()
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is None:
        return None
    category_id = fields.get("category_id", recurring.category_id)
    type_ = fields.get("type", recurring.type)
    validate_category_kind(db, category_id, type_)
    if "savings_product_id" in fields and fields["savings_product_id"] != recurring.savings_product_id:
        _validate_savings_product(db, category_id, type_, fields["savings_product_id"])
    else:
        # 카테고리·유형만 바뀌어도 기존 연결이 여전히 유효한지 본다(비활성 상품은 그대로 둬도 된다).
        validate_savings_link(db, category_id, type_, fields.get("savings_product_id", recurring.savings_product_id))
    # day_of_month(단일 앵커 일자)는 days_of_month/start_date에서 파생된다 — create_recurring과
    # 같은 규칙을 여기서도 적용해 라우터가 계산하지 않게 한다.
    if "days_of_month" in fields or "start_date" in fields:
        days = fields.get("days_of_month", recurring.days_of_month)
        # 지정일을 비우면 시작일 기준으로 돌아간다(예전 최소 지정일이 남으면 25일 → 5일로 바뀐다).
        fields["day_of_month"] = min(days) if days else fields.get("start_date", recurring.start_date).day
    schedule_changed = any(key in fields and fields[key] != getattr(recurring, key) for key in _SCHEDULE_FIELDS)
    for key, value in fields.items():
        setattr(recurring, key, value)
    if schedule_changed:
        recurring.next_due_date = _advance_until(
            db, recurring, _first_due_date(recurring.start_date, recurring.days_of_month), today
        )
    db.commit()
    db.refresh(recurring)
    return recurring


def deactivate_recurring(db: Session, recurring_id: int) -> bool:
    """비활성화했으면 True, 없는 고정지출이면 False(라우터가 404로 바꾼다)."""
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is None:
        return False
    recurring.is_active = False
    db.commit()
    return True


def reactivate_recurring(db: Session, recurring_id: int, today: date | None = None) -> RecurringExpense | None:
    """deactivate_recurring의 대칭 함수. 비활성 기간 동안 밀린 next_due_date를 오늘 이후로
    앞당겨서, 재활성화 직후 generate_due_transactions가 소급분을 한꺼번에 만들어버리지
    않게 한다. 앞당긴 기한이 종료일을 넘으면 RecurringEndedError(409) — 켜도 다음 생성 때 조용히 다시 꺼진다."""
    today = today or today_kst()
    recurring = db.get(RecurringExpense, recurring_id)
    if recurring is None:
        return None
    next_due = recurring.next_due_date
    guard = 0
    while next_due < today and guard < _ADVANCE_GUARD:
        guard += 1
        next_due = advance_recurring_date(next_due, recurring.frequency, recurring.day_of_month, recurring.days_of_month)
    if recurring.end_date and next_due > recurring.end_date:
        raise RecurringEndedError("종료일이 지난 고정지출이에요. 종료일을 먼저 바꾼 뒤 다시 켜 주세요.")
    recurring.next_due_date = next_due
    recurring.is_active = True
    db.commit()
    db.refresh(recurring)
    return recurring


def generate_due_transactions(db: Session, today: date | None = None) -> list[Transaction]:
    """Post a transaction for every active recurring expense whose next_due_date has arrived,
    then roll next_due_date forward. Safe to call repeatedly (idempotent per due date).
    항목 하나가 실패해도 나머지는 만들고, 끝에 PartialFailureError로 알린다(잡이 실패로 보이게)."""
    today = today or today_kst()
    due_items = (
        db.query(RecurringExpense)
        .filter(RecurringExpense.is_active.is_(True), RecurringExpense.next_due_date <= today)
        .all()
    )
    created: list[Transaction] = []
    failed = 0
    for recurring in due_items:
        try:
            # a recurring expense can be overdue by more than one period (e.g. app was off) -
            # post one transaction per elapsed period rather than skipping ahead silently.
            guard = 0
            while recurring.next_due_date <= today and guard < 24:
                guard += 1
                if recurring.end_date and recurring.next_due_date > recurring.end_date:
                    recurring.is_active = False
                    break
                # 다음 기한을 먼저 전진시켜 두면 create_transaction의 commit이 거래와 기한 전진을 한
                # 트랜잭션으로 저장한다. 거래만 커밋되고 전진은 뒤 항목의 commit에 얹혀 있으면, 뒤 항목
                # 실패 시 rollback이 전진만 되돌려 다음 실행에서 같은 기한이 이중 기장된다.
                due_date = recurring.next_due_date
                recurring.next_due_date = advance_recurring_date(
                    due_date, recurring.frequency, recurring.day_of_month, recurring.days_of_month
                )
                tx = create_transaction(
                    db,
                    user_id=recurring.created_by,
                    category_id=recurring.category_id,
                    type_=recurring.type,
                    amount=recurring.amount,
                    transaction_date=due_date,
                    description=recurring.name,
                    recurring_expense_id=recurring.id,
                    # 그 사이 상품을 비활성화했으면 상품 없이(저축 카테고리 거래로) 만든다 — 매일 실패하지 않게.
                    savings_product_id=recurring.savings_product_id
                    if recurring.savings_product is not None and recurring.savings_product.is_active
                    else None,
                )
                created.append(tx)
        except Exception:
            # idempotent per due date — a failed recurring is simply retried on the next run,
            # so one bad item shouldn't block the rest of due_items from being posted. Roll back
            # so a failed flush/commit above doesn't poison the session for the remaining items.
            db.rollback()
            failed += 1
            logger.exception("고정지출 거래 생성 실패: %s", recurring.name)
    db.commit()
    if failed:
        raise PartialFailureError("고정지출 거래 생성", failed, len(created))
    return created
