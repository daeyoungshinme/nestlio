"""add_removed_at_to_users

Revision ID: e5f9b3c7a1d4
Revises: c7e2a4f6d8b1
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5f9b3c7a1d4'
down_revision: Union[str, None] = 'c7e2a4f6d8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('removed_at', sa.DateTime(), nullable=True), schema='household')
    op.add_column(
        'users', sa.Column('removed_by_id', postgresql.UUID(as_uuid=True), nullable=True), schema='household',
    )
    op.create_foreign_key(
        'fk_users_removed_by_id_users',
        'users',
        'users',
        ['removed_by_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_removed_by_id_users', 'users', schema='household', type_='foreignkey')
    op.drop_column('users', 'removed_by_id', schema='household')
    op.drop_column('users', 'removed_at', schema='household')
