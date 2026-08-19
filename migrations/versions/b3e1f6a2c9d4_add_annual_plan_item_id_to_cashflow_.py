"""add_annual_plan_item_id_to_cashflow_plan_items

Revision ID: b3e1f6a2c9d4
Revises: 52e8bdb78448
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e1f6a2c9d4'
down_revision: Union[str, None] = '52e8bdb78448'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cashflow_plan_items',
        sa.Column('annual_plan_item_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_cashflow_plan_items_annual_plan_item_id',
        'cashflow_plan_items',
        'annual_plan_items',
        ['annual_plan_item_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_cashflow_plan_items_annual_plan_item_id',
        'cashflow_plan_items',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('cashflow_plan_items', 'annual_plan_item_id', schema='household')
