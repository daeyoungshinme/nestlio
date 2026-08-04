"""merge_budget_into_cashflow_plan_items

Revision ID: 62fb374dabb8
Revises: d4e8a1c53f27
Create Date: 2026-08-03 20:25:01.356835

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62fb374dabb8'
down_revision: Union[str, None] = 'd4e8a1c53f27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cashflow_plan_items',
        sa.Column('category_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_cashflow_plan_items_category_id_categories',
        'cashflow_plan_items',
        'categories',
        ['category_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )
    op.create_index(
        'uq_cashflow_plan_items_category_month',
        'cashflow_plan_items',
        ['category_id', 'year_month'],
        unique=True,
        schema='household',
        postgresql_where=sa.text('category_id IS NOT NULL'),
    )
    op.execute(
        "INSERT INTO household.cashflow_plan_items "
        "(section, year_month, category_id, name, amount, sort_order, updated_by, updated_at) "
        "SELECT c.type, b.year_month, b.category_id, c.name, b.amount, 0, b.updated_by, b.updated_at "
        "FROM household.budgets b JOIN household.categories c ON c.id = b.category_id"
    )
    op.drop_table('budgets', schema='household')


def downgrade() -> None:
    op.create_table(
        'budgets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['household.categories.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category_id', 'year_month', name='uq_budget_category_month'),
        schema='household',
    )
    op.execute(
        "INSERT INTO household.budgets (category_id, year_month, amount, updated_by, updated_at) "
        "SELECT category_id, year_month, amount, updated_by, updated_at "
        "FROM household.cashflow_plan_items WHERE category_id IS NOT NULL"
    )
    op.drop_index('uq_cashflow_plan_items_category_month', table_name='cashflow_plan_items', schema='household')
    op.drop_constraint(
        'fk_cashflow_plan_items_category_id_categories',
        'cashflow_plan_items',
        schema='household',
        type_='foreignkey',
    )
    op.drop_column('cashflow_plan_items', 'category_id', schema='household')
