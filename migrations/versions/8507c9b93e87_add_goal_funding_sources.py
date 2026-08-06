"""add_goal_funding_sources

Revision ID: 8507c9b93e87
Revises: fa678a79e65f
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8507c9b93e87'
down_revision: Union[str, None] = 'fa678a79e65f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """목표 하나에 저축상품 여러 개를 연결할 수 있도록 다대다 테이블을 도입한다. 기존
    primary_savings_product_id(단일 연동)는 이 테이블의 1행으로 백필한 뒤 컬럼을 제거한다 —
    FinancialGoal.current_amount는 이제 연동된 상품들의 잔액 합으로 계산된다
    (app/models/financial_goal.py 참고)."""
    op.create_table(
        'goal_funding_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('savings_product_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['household.financial_goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['savings_product_id'], ['household.savings_products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('goal_id', 'savings_product_id', name='uq_goal_funding_source'),
        schema='household',
    )

    op.execute(
        """
        INSERT INTO household.goal_funding_sources (goal_id, savings_product_id)
        SELECT id, primary_savings_product_id
        FROM household.financial_goals
        WHERE primary_savings_product_id IS NOT NULL
        """
    )

    op.drop_constraint(
        'fk_financial_goals_primary_savings_product_id',
        'financial_goals',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('financial_goals', 'primary_savings_product_id', schema='household')


def downgrade() -> None:
    op.add_column(
        'financial_goals',
        sa.Column('primary_savings_product_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_financial_goals_primary_savings_product_id',
        'financial_goals',
        'savings_products',
        ['primary_savings_product_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )
    # 다대다 → 단일 컬럼으로 되돌리므로 goal당 여러 상품이 연결돼 있었다면 정보 손실이 있다
    # (가장 먼저 연결된 상품 하나만 복원).
    op.execute(
        """
        UPDATE household.financial_goals g
        SET primary_savings_product_id = fs.savings_product_id
        FROM (
            SELECT DISTINCT ON (goal_id) goal_id, savings_product_id
            FROM household.goal_funding_sources
            ORDER BY goal_id, id
        ) fs
        WHERE fs.goal_id = g.id
        """
    )

    op.drop_table('goal_funding_sources', schema='household')
