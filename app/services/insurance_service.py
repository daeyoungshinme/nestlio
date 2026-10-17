"""보험 계약 CRUD. 점검 규칙은 insurance_review_service(계약 목록 → 점검 결과)에 있다."""
import uuid

from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.errors import NotFoundError
from app.models.insurance_policy import InsurancePolicy
from app.models.insurance_rider import InsuranceRider
from app.models.recurring_expense import RecurringExpense
from app.services import user_service


class InsuredUserNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("피보험자를 찾을 수 없습니다.")


class LinkedRecurringNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("연결할 반복거래를 찾을 수 없습니다.")


def list_policies(db: Session, active_only: bool = True) -> list[InsurancePolicy]:
    query = db.query(InsurancePolicy)
    if active_only:
        query = query.filter(InsurancePolicy.is_active.is_(True))
    return query.order_by(InsurancePolicy.sort_order, InsurancePolicy.name).all()


def _validate_refs(
    db: Session,
    insured_user_id: uuid.UUID | None,
    recurring_expense_id: int | None,
    current_insured_user_id: uuid.UUID | None = None,
) -> None:
    # SQLite 테스트는 FK를 강제하지 않고 Postgres는 IntegrityError(500)를 내므로 서비스에서 404로 막는다.
    # 제거된 배우자는 새 피보험자로 지정할 수 없다. 이미 그 사람으로 저장된 계약은 다른 필드를 고칠 수 있게 둔다.
    if (
        insured_user_id is not None
        and insured_user_id != current_insured_user_id
        and user_service.get_active_user(db, insured_user_id) is None
    ):
        raise InsuredUserNotFoundError()
    if recurring_expense_id is not None and db.get(RecurringExpense, recurring_expense_id) is None:
        raise LinkedRecurringNotFoundError()


class RiderNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("이 계약의 특약이 아닙니다.")


def _replace_riders(policy: InsurancePolicy, riders: list[dict]) -> None:
    """id로 기존 특약을 갱신하고, 없는 id는 추가, 목록에 없는 기존 특약은 삭제(delete-orphan)한다."""
    existing = {r.id: r for r in policy.riders}
    kept: list[InsuranceRider] = []
    for order, fields in enumerate(riders):
        rider_id = fields.get("id")
        if rider_id is not None and rider_id not in existing:
            raise RiderNotFoundError()
        rider = existing.get(rider_id) if rider_id is not None else InsuranceRider()
        for key, value in fields.items():
            if key != "id":
                setattr(rider, key, value)
        rider.sort_order = order
        kept.append(rider)
    policy.riders = kept


def _apply(policy: InsurancePolicy, fields: dict) -> None:
    riders = fields.pop("riders", None)
    for key, value in fields.items():
        setattr(policy, key, value)
    if riders is not None:
        _replace_riders(policy, riders)
    # 특약을 입력했으면 보장 태그는 특약에서 만든다 — 계약 단위 규칙(coverage_overlap 등)이 그대로 쓴다.
    if policy.riders:
        policy.coverages = list(dict.fromkeys(r.coverage for r in policy.riders if r.coverage != "other"))
    # 피보험자가 부부 중 한 명이면 이름은 사용자 표시 이름을 쓰므로 따로 저장하지 않는다.
    if policy.insured_user_id is not None:
        policy.insured_name = None
    # 자동차보험은 매년 갱신한다. 그 밖의 비갱신형에는 갱신일이 없다.
    if policy.policy_type == "auto":
        policy.is_renewable = True
    if not policy.is_renewable:
        policy.next_renewal_date = None


def create_policy(db: Session, fields: dict) -> InsurancePolicy:
    _validate_refs(db, fields.get("insured_user_id"), fields.get("recurring_expense_id"))
    policy = InsurancePolicy(sort_order=DEFAULT_SORT_ORDER, is_active=True)
    _apply(policy, fields)
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def update_policy(db: Session, policy_id: int, fields: dict) -> InsurancePolicy | None:
    policy = db.get(InsurancePolicy, policy_id)
    if policy is None:
        return None
    _validate_refs(
        db, fields.get("insured_user_id"), fields.get("recurring_expense_id"), policy.insured_user_id
    )
    _apply(policy, fields)
    db.commit()
    db.refresh(policy)
    return policy


def deactivate_policy(db: Session, policy_id: int) -> bool:
    """해지·만기된 계약 — 점검 대상에서 빠지도록 비활성화. 없으면 False(라우터가 404)."""
    policy = db.get(InsurancePolicy, policy_id)
    if policy is None:
        return False
    policy.is_active = False
    db.commit()
    return True
