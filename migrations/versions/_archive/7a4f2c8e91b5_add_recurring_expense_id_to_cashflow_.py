"""add_recurring_expense_id_to_cashflow_plan_items

Revision ID: 7a4f2c8e91b5
Revises: 1207d4ccc9d7
Create Date: 2026-08-06 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a4f2c8e91b5'
down_revision: Union[str, None] = '1207d4ccc9d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cashflow_plan_items',
        sa.Column('recurring_expense_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_cashflow_plan_items_recurring_expense_id',
        'cashflow_plan_items',
        'recurring_expenses',
        ['recurring_expense_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_cashflow_plan_items_recurring_expense_id',
        'cashflow_plan_items',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('cashflow_plan_items', 'recurring_expense_id', schema='household')
