"""growlio goal snapshots

부부 각자가 growlio에 설정한 투자목표와 진행 상황의 마지막 값. app/models/growlio_goal_snapshot.py 참고.

Revision ID: d4a7e2c9b5f1
Revises: c8e2f5a7b1d3
Create Date: 2026-11-06 10:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4a7e2c9b5f1"
down_revision: Union[str, None] = "c8e2f5a7b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "growlio_goal_snapshots",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("is_configured", sa.Boolean(), nullable=False),
        sa.Column("goal_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("investable_assets", sa.Numeric(14, 2), nullable=True),
        sa.Column("monthly_deposit_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("annual_deposit_goal", sa.Numeric(14, 2), nullable=True),
        sa.Column("annual_deposit_current", sa.Numeric(14, 2), nullable=True),
        sa.Column("annual_dividend_goal", sa.Numeric(14, 2), nullable=True),
        sa.Column("estimated_annual_dividend", sa.Numeric(14, 2), nullable=True),
        sa.Column("goal_annual_return_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("actual_return_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("retirement_target_year", sa.Integer(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["household.users.id"], name="fk_growlio_goal_snapshots_user_id_users"
        ),
        sa.PrimaryKeyConstraint("user_id"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("growlio_goal_snapshots", schema="household")
