"""add_notification_reactions

Revision ID: b4d8f1a6c2e9
Revises: efd6efab3bbc
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d8f1a6c2e9'
down_revision: Union[str, None] = 'efd6efab3bbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notification_reaction',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_log_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('emoji', sa.String(length=8), nullable=False),
        sa.Column('message', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['notification_log_id'], ['household.notification_log.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )
    op.create_index(
        op.f('ix_household_notification_reaction_notification_log_id'),
        'notification_reaction', ['notification_log_id'], unique=False, schema='household',
    )
    op.create_index(
        op.f('ix_household_notification_reaction_user_id'),
        'notification_reaction', ['user_id'], unique=False, schema='household',
    )
    op.create_unique_constraint(
        'uq_notification_reaction_log_user', 'notification_reaction', ['notification_log_id', 'user_id'],
        schema='household',
    )


def downgrade() -> None:
    op.drop_constraint('uq_notification_reaction_log_user', 'notification_reaction', schema='household', type_='unique')
    op.drop_index(
        op.f('ix_household_notification_reaction_user_id'), table_name='notification_reaction', schema='household',
    )
    op.drop_index(
        op.f('ix_household_notification_reaction_notification_log_id'),
        table_name='notification_reaction', schema='household',
    )
    op.drop_table('notification_reaction', schema='household')
