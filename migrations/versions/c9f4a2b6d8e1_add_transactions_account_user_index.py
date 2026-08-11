"""add_transactions_account_user_index

Revision ID: c9f4a2b6d8e1
Revises: b7d3f9a1c5e6
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9f4a2b6d8e1'
down_revision: Union[str, None] = 'b7d3f9a1c5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_household_transactions_account_id',
        'transactions',
        ['account_id'],
        unique=False,
        schema='household',
    )
    op.create_index(
        'ix_household_transactions_user_id',
        'transactions',
        ['user_id'],
        unique=False,
        schema='household',
    )


def downgrade() -> None:
    op.drop_index(
        'ix_household_transactions_user_id',
        table_name='transactions',
        schema='household',
    )
    op.drop_index(
        'ix_household_transactions_account_id',
        table_name='transactions',
        schema='household',
    )
