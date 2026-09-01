"""add_events

Revision ID: 17a1df3c18e4
Revises: 9e12ea51685e
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17a1df3c18e4'
down_revision: Union[str, None] = '9e12ea51685e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('all_day', sa.Boolean(), nullable=False),
        sa.Column('start_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=True),
        sa.Column('frequency', sa.String(length=10), nullable=False),
        sa.Column('recurrence_end_date', sa.Date(), nullable=True),
        sa.Column('reminder_minutes_before', sa.Integer(), nullable=True),
        sa.Column('google_calendar_event_id', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('events', schema='household')
