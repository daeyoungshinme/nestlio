"""combined goal members

부부 통합 목표(financial_goals.kind="combined")의 구성 — nestlio 장기 목표 또는 한 사람의 growlio 투자목표.
app/models/combined_goal_member.py 참고. kind는 String(10)이라 컬럼 변경은 없다.

Revision ID: e9c4b1f7a3d2
Revises: d4a7e2c9b5f1
Create Date: 2026-11-06 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9c4b1f7a3d2"
down_revision: Union[str, None] = "d4a7e2c9b5f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "combined_goal_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("combined_goal_id", sa.Integer(), nullable=False),
        sa.Column("member_goal_id", sa.Integer(), nullable=True),
        sa.Column("growlio_user_id", sa.UUID(), nullable=True),
        sa.CheckConstraint(
            "(CASE WHEN member_goal_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN growlio_user_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_combined_goal_member_exactly_one_type",
        ),
        sa.ForeignKeyConstraint(
            ["combined_goal_id"],
            ["household.financial_goals.id"],
            name="fk_combined_goal_members_combined_goal_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["member_goal_id"],
            ["household.financial_goals.id"],
            name="fk_combined_goal_members_member_goal_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["growlio_user_id"], ["household.users.id"], name="fk_combined_goal_members_growlio_user_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("combined_goal_id", "member_goal_id", name="uq_combined_goal_member_goal"),
        sa.UniqueConstraint("combined_goal_id", "growlio_user_id", name="uq_combined_goal_member_growlio_user"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("combined_goal_members", schema="household")
