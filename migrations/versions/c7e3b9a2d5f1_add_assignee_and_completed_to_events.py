"""add_assignee_and_completed_to_events

Revision ID: c7e3b9a2d5f1
Revises: b4d8f1a6c2e9
Create Date: 2026-08-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e3b9a2d5f1'
down_revision: Union[str, None] = 'b4d8f1a6c2e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('assignee_id', sa.UUID(), nullable=True), schema='household')
    op.add_column('events', sa.Column('completed_at', sa.DateTime(), nullable=True), schema='household')
    op.create_foreign_key(
        'fk_events_assignee_id_users',
        'events', 'users',
        ['assignee_id'], ['id'],
        source_schema='household', referent_schema='household',
    )


def downgrade() -> None:
    op.drop_constraint('fk_events_assignee_id_users', 'events', schema='household', type_='foreignkey')
    op.drop_column('events', 'completed_at', schema='household')
    op.drop_column('events', 'assignee_id', schema='household')
