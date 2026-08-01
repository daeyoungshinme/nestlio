"""add_is_discretionary_and_is_debt_to_categories

Revision ID: f53d857a042d
Revises: d915065b8002
Create Date: 2026-07-31 07:53:33.306999

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f53d857a042d'
down_revision: Union[str, None] = 'd915065b8002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'categories',
        sa.Column('is_discretionary', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='household',
    )
    op.add_column(
        'categories',
        sa.Column('is_debt', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='household',
    )
    op.execute("UPDATE household.categories SET is_discretionary = true WHERE name IN ('여가', '쇼핑')")
    op.execute("UPDATE household.categories SET is_debt = true WHERE name = '대출상환'")


def downgrade() -> None:
    op.drop_column('categories', 'is_debt', schema='household')
    op.drop_column('categories', 'is_discretionary', schema='household')
