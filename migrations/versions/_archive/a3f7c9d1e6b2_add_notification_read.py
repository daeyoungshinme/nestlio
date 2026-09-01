"""add_notification_read

Revision ID: a3f7c9d1e6b2
Revises: 6eb4668e5eb8
Create Date: 2026-08-03 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f7c9d1e6b2'
down_revision: Union[str, None] = '6eb4668e5eb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notification_read',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_log_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('read_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['notification_log_id'], ['household.notification_log.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )
    op.create_index(
        op.f('ix_household_notification_read_notification_log_id'),
        'notification_read', ['notification_log_id'], unique=False, schema='household',
    )
    op.create_index(
        op.f('ix_household_notification_read_user_id'),
        'notification_read', ['user_id'], unique=False, schema='household',
    )
    op.create_unique_constraint(
        'uq_notification_read_log_user', 'notification_read', ['notification_log_id', 'user_id'], schema='household',
    )


def downgrade() -> None:
    op.drop_constraint('uq_notification_read_log_user', 'notification_read', schema='household', type_='unique')
    op.drop_index(
        op.f('ix_household_notification_read_user_id'), table_name='notification_read', schema='household',
    )
    op.drop_index(
        op.f('ix_household_notification_read_notification_log_id'),
        table_name='notification_read', schema='household',
    )
    op.drop_table('notification_read', schema='household')
