"""add_goal_monthly_targets

Revision ID: f4b8c1d6a3e5
Revises: e2c4a6f8b1d3
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4b8c1d6a3e5'
down_revision: Union[str, None] = 'e2c4a6f8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """장기목표(kind='goal')의 월별 목표/달성 금액 테이블을 추가한다. 추가 당시에는 기간제
    비정기 지출 목표(kind='irregular') 전용이었으나 이후 'goal'로 통합되며 'irregular' kind
    자체가 폐지됐다 — 이 테이블 자체는 그대로 재사용된다."""
    op.create_table(
        'goal_monthly_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('achieved_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['household.financial_goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('goal_id', 'year_month', name='uq_goal_monthly_target_month'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('goal_monthly_targets', schema='household')
