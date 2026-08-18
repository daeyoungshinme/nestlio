"""add_savings_product_annual_plans

Revision ID: 52e8bdb78448
Revises: adcb893c3814
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52e8bdb78448'
down_revision: Union[str, None] = 'adcb893c3814'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """저축/투자 상품(SavingsProduct)에 연도별 적용기간 + 월별 목표금액 계획을 추가한다 —
    AnnualPlanItem(수입/지출)과 동일한 구조. 이 계획이 없는 상품/달은 서비스 계층에서 기존
    SavingsProduct.monthly_saving_amount로 폴백하므로 monthly_saving_amount 컬럼은 그대로 둔다
    (백필 불필요)."""
    op.create_table(
        'savings_product_annual_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('start_month', sa.String(length=7), nullable=False),
        sa.Column('end_month', sa.String(length=7), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['household.savings_products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('product_id', 'year', name='uq_savings_product_annual_plan_year'),
        schema='household',
    )
    op.create_table(
        'savings_product_annual_plan_monthly_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(
            ['plan_id'], ['household.savings_product_annual_plans.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'plan_id', 'year_month', name='uq_savings_product_annual_plan_monthly_target_month'
        ),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('savings_product_annual_plan_monthly_targets', schema='household')
    op.drop_table('savings_product_annual_plans', schema='household')
