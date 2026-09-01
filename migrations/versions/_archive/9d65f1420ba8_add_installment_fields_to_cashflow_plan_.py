"""add_installment_fields_to_cashflow_plan_items

Revision ID: 9d65f1420ba8
Revises: 3d41cbe36e09
Create Date: 2026-08-01 15:35:53.278442

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d65f1420ba8'
down_revision: Union[str, None] = '3d41cbe36e09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cashflow_plan_items', sa.Column('installment_no', sa.Integer(), nullable=True), schema='household')
    op.add_column(
        'cashflow_plan_items', sa.Column('installment_total', sa.Integer(), nullable=True), schema='household'
    )


def downgrade() -> None:
    op.drop_column('cashflow_plan_items', 'installment_total', schema='household')
    op.drop_column('cashflow_plan_items', 'installment_no', schema='household')
