"""add_owner_user_id_to_transactions

Revision ID: a068af230aeb
Revises: b6d6e8ec4c7e
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a068af230aeb'
down_revision: Union[str, None] = 'b6d6e8ec4c7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('owner_user_id', sa.UUID(), nullable=True), schema='household')
    op.create_foreign_key(
        'transactions_owner_user_id_fkey',
        'transactions',
        'users',
        ['owner_user_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )


def downgrade() -> None:
    op.drop_constraint('transactions_owner_user_id_fkey', 'transactions', schema='household', type_='foreignkey')
    op.drop_column('transactions', 'owner_user_id', schema='household')
