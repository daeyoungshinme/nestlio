"""add_benchmark_group_to_categories

Revision ID: efd6efab3bbc
Revises: b3e1f6a2c9d4
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'efd6efab3bbc'
down_revision: Union[str, None] = 'b3e1f6a2c9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'categories',
        sa.Column('benchmark_group', sa.String(length=30), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('categories', 'benchmark_group', schema='household')
