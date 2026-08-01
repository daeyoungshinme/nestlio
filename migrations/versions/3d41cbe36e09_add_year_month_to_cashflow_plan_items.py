"""add_year_month_to_cashflow_plan_items

Revision ID: 3d41cbe36e09
Revises: f53d857a042d
Create Date: 2026-07-31 08:30:00.000000

"""
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d41cbe36e09'
down_revision: Union[str, None] = 'f53d857a042d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cashflow_plan_items',
        sa.Column('year_month', sa.String(length=7), nullable=True),
        schema='household',
    )
    current_year_month = date.today().strftime('%Y-%m')
    op.execute(f"UPDATE household.cashflow_plan_items SET year_month = '{current_year_month}'")
    op.alter_column('cashflow_plan_items', 'year_month', nullable=False, schema='household')


def downgrade() -> None:
    op.drop_column('cashflow_plan_items', 'year_month', schema='household')
