"""add_is_savings_and_savings_product_link

Revision ID: b59c13ba4d0a
Revises: cff91320f6b4
Create Date: 2026-08-01 18:03:35.102894

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b59c13ba4d0a'
down_revision: Union[str, None] = 'cff91320f6b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'categories',
        sa.Column('is_savings', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='household',
    )
    op.add_column(
        'transactions',
        sa.Column('savings_product_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_transactions_savings_product_id_savings_products',
        'transactions',
        'savings_products',
        ['savings_product_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )
    op.execute(
        "INSERT INTO household.categories (name, kind, type, color, is_active, is_discretionary, is_debt, "
        "is_savings, sort_order) "
        "SELECT '저축/투자', 'expense', 'fixed', '#10b981', true, false, false, true, 999 "
        "WHERE NOT EXISTS (SELECT 1 FROM household.categories WHERE name = '저축/투자')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM household.categories WHERE name = '저축/투자' AND is_savings = true")
    op.drop_constraint(
        'fk_transactions_savings_product_id_savings_products',
        'transactions',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('transactions', 'savings_product_id', schema='household')
    op.drop_column('categories', 'is_savings', schema='household')
