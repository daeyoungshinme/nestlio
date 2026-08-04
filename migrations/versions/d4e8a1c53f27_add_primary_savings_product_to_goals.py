"""add_primary_savings_product_to_financial_goals

Revision ID: d4e8a1c53f27
Revises: c1a2f4e7b9d3
Create Date: 2026-08-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8a1c53f27'
down_revision: Union[str, None] = 'c1a2f4e7b9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_constraint(
        'fk_financial_goals_primary_savings_product_id',
        'financial_goals',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('financial_goals', 'primary_savings_product_id', schema='household')
