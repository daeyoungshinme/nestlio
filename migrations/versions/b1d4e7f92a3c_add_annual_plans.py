"""add_annual_plans

Revision ID: b1d4e7f92a3c
Revises: a7c92e4f18b6
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1d4e7f92a3c'
down_revision: Union[str, None] = 'a7c92e4f18b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """연도 x 축(수입/지출/저축투자)별 연간 목표금액과 그 월별 분해 테이블을 추가한다 —
    개별 재무목표(FinancialGoal/GoalMonthlyTarget)와 별개로, 가구 전체의 달력연도 기준
    수입/지출/저축투자 계획을 다룬다."""
    op.create_table(
        'annual_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('axis', sa.String(length=20), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('year', 'axis', name='uq_annual_plan_year_axis'),
        schema='household',
    )
    op.create_table(
        'annual_plan_monthly_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('annual_plan_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['annual_plan_id'], ['household.annual_plans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('annual_plan_id', 'year_month', name='uq_annual_plan_monthly_target_month'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('annual_plan_monthly_targets', schema='household')
    op.drop_table('annual_plans', schema='household')
