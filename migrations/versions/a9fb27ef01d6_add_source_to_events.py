"""add_source_to_events

Revision ID: a9fb27ef01d6
Revises: a068af230aeb
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9fb27ef01d6'
down_revision: Union[str, None] = 'a068af230aeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'events',
        sa.Column('source', sa.String(length=20), nullable=False, server_default='native'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('events', 'source', schema='household')
