"""add_growlio_sync_to_accounts

Revision ID: 7f48f43d80a8
Revises: f1a9c5e3b7d2
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f48f43d80a8'
down_revision: Union[str, None] = 'f1a9c5e3b7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'accounts',
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('accounts', 'last_synced_at', schema='household')
