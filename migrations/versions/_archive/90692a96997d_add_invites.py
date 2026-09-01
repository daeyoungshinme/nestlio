"""add_invites

Revision ID: 90692a96997d
Revises: b59c13ba4d0a
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '90692a96997d'
down_revision: Union[str, None] = 'b59c13ba4d0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'invites',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('invited_by_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['invited_by_id'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )
    op.create_index(op.f('ix_household_invites_email'), 'invites', ['email'], unique=False, schema='household')
    op.create_index(op.f('ix_household_invites_token'), 'invites', ['token'], unique=True, schema='household')


def downgrade() -> None:
    op.drop_index(op.f('ix_household_invites_token'), table_name='invites', schema='household')
    op.drop_index(op.f('ix_household_invites_email'), table_name='invites', schema='household')
    op.drop_table('invites', schema='household')
