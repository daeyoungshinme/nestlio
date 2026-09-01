"""replace_annual_plan_with_items

Revision ID: c3e6a9f1b4d7
Revises: b1d4e7f92a3c
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e6a9f1b4d7'
down_revision: Union[str, None] = 'b1d4e7f92a3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """지난 리비전의 연간계획(연도 x 축 단일 목표금액)을 항목 기반 구조로 교체한다 — 월간
    CashflowPlanItem처럼 여러 항목을 등록하고 항목마다 12개월 목표금액을 갖는다. 이전 테이블은
    실사용 데이터가 없어(0행 확인) 백필 없이 drop 후 재생성한다."""
    op.drop_table('annual_plan_monthly_targets', schema='household')
    op.drop_table('annual_plans', schema='household')

    op.create_table(
        'annual_plan_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('section', sa.String(length=10), nullable=False),
        sa.Column('owner_user_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_user_id'], ['household.users.id']),
        sa.ForeignKeyConstraint(['category_id'], ['household.categories.id']),
        sa.ForeignKeyConstraint(['updated_by'], ['household.users.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )
    op.create_table(
        'annual_plan_item_monthly_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['item_id'], ['household.annual_plan_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('item_id', 'year_month', name='uq_annual_plan_item_monthly_target_month'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('annual_plan_item_monthly_targets', schema='household')
    op.drop_table('annual_plan_items', schema='household')

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
