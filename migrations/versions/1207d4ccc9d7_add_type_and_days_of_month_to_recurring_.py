"""add_type_and_days_of_month_to_recurring_expenses

Revision ID: 1207d4ccc9d7
Revises: 426921f2ec6c
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1207d4ccc9d7'
down_revision: Union[str, None] = '426921f2ec6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'recurring_expenses',
        sa.Column('type', sa.String(length=10), nullable=False, server_default='expense'),
        schema='household',
    )
    op.add_column(
        'recurring_expenses',
        sa.Column('days_of_month', sa.JSON(), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('recurring_expenses', 'days_of_month', schema='household')
    op.drop_column('recurring_expenses', 'type', schema='household')
