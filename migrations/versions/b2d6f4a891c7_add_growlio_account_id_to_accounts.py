"""add_growlio_account_id_to_accounts

Revision ID: b2d6f4a891c7
Revises: 8507c9b93e87
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d6f4a891c7'
down_revision: Union[str, None] = '8507c9b93e87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'accounts',
        sa.Column('growlio_account_id', sa.String(36), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('accounts', 'growlio_account_id', schema='household')
