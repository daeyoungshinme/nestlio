"""add_transactions_date_index

Revision ID: a1b2c3d4e5f6
Revises: df550907f638
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'df550907f638'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_household_transactions_transaction_date',
        'transactions',
        ['transaction_date'],
        unique=False,
        schema='household',
    )


def downgrade() -> None:
    op.drop_index(
        'ix_household_transactions_transaction_date',
        table_name='transactions',
        schema='household',
    )
