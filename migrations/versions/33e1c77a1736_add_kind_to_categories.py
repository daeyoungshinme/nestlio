"""add_kind_to_categories

Revision ID: 33e1c77a1736
Revises: 8c3357497c00
Create Date: 2026-07-30 16:50:47.731991

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '33e1c77a1736'
down_revision: Union[str, None] = '8c3357497c00'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'categories',
        sa.Column('kind', sa.String(length=10), nullable=False, server_default='expense'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('categories', 'kind', schema='household')
