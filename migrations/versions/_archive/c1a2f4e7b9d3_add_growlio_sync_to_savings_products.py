"""add_growlio_sync_to_savings_products

Revision ID: c1a2f4e7b9d3
Revises: a3f7c9d1e6b2
Create Date: 2026-08-03 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2f4e7b9d3'
down_revision: Union[str, None] = 'a3f7c9d1e6b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'savings_products',
        sa.Column('growlio_account_id', sa.String(36), nullable=True),
        schema='household',
    )
    op.add_column(
        'savings_products',
        sa.Column('auto_sync_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='household',
    )
    op.add_column(
        'savings_products',
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('savings_products', 'last_synced_at', schema='household')
    op.drop_column('savings_products', 'auto_sync_enabled', schema='household')
    op.drop_column('savings_products', 'growlio_account_id', schema='household')
