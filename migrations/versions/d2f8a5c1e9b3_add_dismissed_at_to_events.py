"""add_dismissed_at_to_events

Revision ID: d2f8a5c1e9b3
Revises: a9fb27ef01d6
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2f8a5c1e9b3'
down_revision: Union[str, None] = 'a9fb27ef01d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('dismissed_at', sa.DateTime(), nullable=True), schema='household')


def downgrade() -> None:
    op.drop_column('events', 'dismissed_at', schema='household')
