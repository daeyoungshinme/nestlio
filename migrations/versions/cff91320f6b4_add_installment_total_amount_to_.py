"""add_installment_total_amount_to_cashflow_plan_items

Revision ID: cff91320f6b4
Revises: 9d65f1420ba8
Create Date: 2026-08-01 15:48:29.372982

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cff91320f6b4'
down_revision: Union[str, None] = '9d65f1420ba8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cashflow_plan_items',
        sa.Column('installment_total_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('cashflow_plan_items', 'installment_total_amount', schema='household')
