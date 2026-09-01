"""add_owner_user_id_to_accounts_savings_products_loans

Revision ID: b6d6e8ec4c7e
Revises: 7f48f43d80a8
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6d6e8ec4c7e'
down_revision: Union[str, None] = '7f48f43d80a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ('accounts', 'savings_products', 'loans'):
        op.add_column(table, sa.Column('owner_user_id', sa.UUID(), nullable=True), schema='household')
        op.create_foreign_key(
            f'{table}_owner_user_id_fkey',
            table,
            'users',
            ['owner_user_id'],
            ['id'],
            source_schema='household',
            referent_schema='household',
        )


def downgrade() -> None:
    for table in ('accounts', 'savings_products', 'loans'):
        op.drop_constraint(f'{table}_owner_user_id_fkey', table, schema='household', type_='foreignkey')
        op.drop_column(table, 'owner_user_id', schema='household')
