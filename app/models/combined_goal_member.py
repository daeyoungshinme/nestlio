import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import User

if TYPE_CHECKING:
    from app.models.financial_goal import FinancialGoal


class CombinedGoalMember(Base):
    """부부 통합 목표(FinancialGoal.kind="combined")의 구성 하나 — nestlio 장기 목표(`member_goal_id`) 또는 한 사람의
    growlio 투자목표(`growlio_user_id` → GrowlioGoalSnapshot) 중 정확히 하나. 통합 목표의 목표금액·현재금액·월 계획은
    구성들의 합이다(app/services/combined_goal_service.py, goal_progress_service)."""

    __tablename__ = "combined_goal_members"
    __table_args__ = (
        UniqueConstraint("combined_goal_id", "member_goal_id", name="uq_combined_goal_member_goal"),
        UniqueConstraint("combined_goal_id", "growlio_user_id", name="uq_combined_goal_member_growlio_user"),
        CheckConstraint(
            "(CASE WHEN member_goal_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN growlio_user_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_combined_goal_member_exactly_one_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    combined_goal_id: Mapped[int] = mapped_column(
        ForeignKey("financial_goals.id", ondelete="CASCADE", name="fk_combined_goal_members_combined_goal_id")
    )
    member_goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_goals.id", ondelete="CASCADE", name="fk_combined_goal_members_member_goal_id"),
        nullable=True,
    )
    growlio_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", name="fk_combined_goal_members_growlio_user_id"), nullable=True
    )

    member_goal: Mapped["FinancialGoal | None"] = relationship(foreign_keys=[member_goal_id], lazy="joined")
    growlio_user: Mapped["User | None"] = relationship(lazy="joined")
