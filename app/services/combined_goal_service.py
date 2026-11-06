"""부부 통합 목표(FinancialGoal.kind="combined")의 구성 저장과 목표금액 재계산.

모델만 import하는 말단 모듈이다 — goal_service(목표 저장)와 growlio_goal_snapshot_service(growlio 값 갱신) 양쪽이
목표금액 재계산을 부르고, goal_progress_service가 저장값 조회를 부르므로 여기서 서비스를 import하면 순환이 된다.
진행금액·월 계획 계산은 goal_progress_service에 있다."""

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.errors import InvalidInputError
from app.models.combined_goal_member import CombinedGoalMember
from app.models.financial_goal import FinancialGoal
from app.models.growlio_goal_snapshot import GrowlioGoalSnapshot
from app.models.user import User

KIND = "combined"
# 구성으로 넣을 수 있는 nestlio 목표 — 챌린지는 단기라 장기 목표와 섞으면 합계가 의미를 잃고, 순자산 목표는 가구
# 전체 자산이라 growlio 투자자산·장기 목표 자금원과 전부 겹친다.
MEMBER_GOAL_KIND = "goal"


class InvalidCombinedMemberError(InvalidInputError):
    pass


def active_snapshots(db: Session) -> dict[uuid.UUID, GrowlioGoalSnapshot]:
    """가구에서 제거되지 않은 사용자의 growlio 목표 저장값."""
    rows = (
        db.query(GrowlioGoalSnapshot)
        .join(User, User.id == GrowlioGoalSnapshot.user_id)
        .filter(User.removed_at.is_(None))
        .all()
    )
    return {row.user_id: row for row in rows}


def counted_snapshot(member: CombinedGoalMember, snapshots: dict[uuid.UUID, GrowlioGoalSnapshot]):
    """합산에 넣을 growlio 저장값 — 제거된 사용자, 아직 저장 전, growlio에 목표 미설정이면 None."""
    if member.growlio_user_id is None:
        return None
    snapshot = snapshots.get(member.growlio_user_id)
    return snapshot if snapshot is not None and snapshot.is_configured else None


def apply_members(
    db: Session, goal: FinancialGoal, member_goal_ids: list[int], growlio_user_ids: list[uuid.UUID]
) -> None:
    """구성을 통째로 바꾼다(기존 행은 재사용). 구성 목표는 kind="goal"만, growlio는 가구 사용자만, 최소 하나."""
    member_goal_ids = list(dict.fromkeys(member_goal_ids))
    growlio_user_ids = list(dict.fromkeys(growlio_user_ids))
    if not member_goal_ids and not growlio_user_ids:
        raise InvalidCombinedMemberError("통합 목표에 묶을 목표를 하나 이상 골라 주세요.")
    if member_goal_ids:
        found = {
            g.id: g for g in db.query(FinancialGoal).filter(FinancialGoal.id.in_(member_goal_ids)).all()
        }
        for goal_id in member_goal_ids:
            member = found.get(goal_id)
            if member is None or member.kind != MEMBER_GOAL_KIND:
                raise InvalidCombinedMemberError("통합 목표에는 장기 목표만 묶을 수 있어요.")
    if growlio_user_ids:
        active = {
            u.id for u in db.query(User).filter(User.id.in_(growlio_user_ids), User.removed_at.is_(None)).all()
        }
        if set(growlio_user_ids) - active:
            raise InvalidCombinedMemberError("가구 구성원의 growlio 목표만 묶을 수 있어요.")

    existing_goals = {m.member_goal_id: m for m in goal.combined_members if m.member_goal_id is not None}
    existing_users = {m.growlio_user_id: m for m in goal.combined_members if m.growlio_user_id is not None}
    goal.combined_members = [
        existing_goals.get(gid) or CombinedGoalMember(member_goal_id=gid) for gid in member_goal_ids
    ] + [existing_users.get(uid) or CombinedGoalMember(growlio_user_id=uid) for uid in growlio_user_ids]


def detach_member_goal(db: Session, goal_id: int) -> None:
    """삭제되는 목표를 통합 목표 구성에서 뺀다 — DB의 ON DELETE CASCADE에 맡기면 세션에 올라 있는 통합 목표의
    구성 컬렉션이 커밋 전까지 지워진 목표를 계속 들고 있어 재계산이 틀린다."""
    for row in db.query(CombinedGoalMember).filter(CombinedGoalMember.member_goal_id == goal_id).all():
        db.delete(row)
    db.flush()


def required_for(goal: FinancialGoal, snapshots: dict[uuid.UUID, GrowlioGoalSnapshot]) -> Decimal:
    total = Decimal("0")
    for member in goal.combined_members:
        if member.member_goal is not None:
            total += member.member_goal.required_amount or Decimal("0")
        elif (snapshot := counted_snapshot(member, snapshots)) is not None:
            total += snapshot.goal_amount or Decimal("0")
    return total


def recompute_required(db: Session) -> None:
    """통합 목표의 저장 목표금액을 구성 합으로 다시 맞춘다(커밋은 호출자). 목표금액을 읽는 곳(마일스톤 알림·메일·
    달성 가능성)이 따로 계산하지 않아도 되게 저장해 두는 것 — 구성 저장, 구성 목표 수정·삭제, growlio 값 갱신 뒤 부른다."""
    goals = db.query(FinancialGoal).filter(FinancialGoal.kind == KIND).all()
    if not goals:
        return
    db.flush()
    snapshots = active_snapshots(db)
    for goal in goals:
        db.refresh(goal, ["combined_members"])
        goal.required_amount = required_for(goal, snapshots)
