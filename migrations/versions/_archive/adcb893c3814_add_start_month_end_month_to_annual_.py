"""add start_month end_month to annual_plan_items

Revision ID: adcb893c3814
Revises: d1a4c7e9b2f6
Create Date: 2026-08-18 15:18:45.641076

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'adcb893c3814'
down_revision: Union[str, None] = 'd1a4c7e9b2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'annual_plan_items',
        sa.Column('start_month', sa.String(length=7), nullable=True),
        schema='household',
    )
    op.add_column(
        'annual_plan_items',
        sa.Column('end_month', sa.String(length=7), nullable=True),
        schema='household',
    )
    op.execute(
        "UPDATE household.annual_plan_items "
        "SET start_month = year::text || '-01', end_month = year::text || '-12'"
    )
    op.alter_column('annual_plan_items', 'start_month', nullable=False, schema='household')
    op.alter_column('annual_plan_items', 'end_month', nullable=False, schema='household')


def downgrade() -> None:
    op.drop_column('annual_plan_items', 'end_month', schema='household')
    op.drop_column('annual_plan_items', 'start_month', schema='household')
