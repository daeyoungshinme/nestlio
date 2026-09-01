"""add_annual_savings_goals

Revision ID: a1c4e7b2d9f3
Revises: e5f9b3c7a1d4
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4e7b2d9f3'
down_revision: Union[str, None] = 'e5f9b3c7a1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """growlio의 AnnualSavingsGoal(연도별 순저축 목표)을 이 앱으로 이관한다 — 부부 가구 공동 값
    하나로 관리하므로(growlio처럼 user_id별로 나누지 않음) year만으로 유일하다. growlio는 이제
    이 값을 직접 입력받지 않고 GET /api/v1/external/annual-savings-goals로 읽기전용 동기화한다."""
    op.create_table(
        'annual_savings_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('target_amount_krw', sa.Numeric(14, 2), nullable=False),
        sa.Column('monthly_target_krw', sa.Numeric(12, 2), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('year', name='uq_annual_savings_goal_year'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('annual_savings_goals', schema='household')
