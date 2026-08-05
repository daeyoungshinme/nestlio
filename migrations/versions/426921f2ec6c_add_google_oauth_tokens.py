"""add_google_oauth_tokens

Revision ID: 426921f2ec6c
Revises: fa335f75dc0f
Create Date: 2026-08-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '426921f2ec6c'
down_revision: Union[str, None] = 'fa335f75dc0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'google_oauth_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('access_token', sa.String(length=2000), nullable=False),
        sa.Column('refresh_token', sa.String(length=500), nullable=True),
        sa.Column('token_uri', sa.String(length=200), nullable=False),
        sa.Column('scopes', sa.String(length=500), nullable=False),
        sa.Column('expiry', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('google_oauth_tokens', schema='household')
