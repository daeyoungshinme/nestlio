"""add_goal_current_amount_and_net_worth_snapshots

Revision ID: d915065b8002
Revises: 33e1c77a1736
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd915065b8002'
down_revision: Union[str, None] = '33e1c77a1736'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'financial_goals',
        sa.Column('current_amount', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        schema='household',
    )
    op.alter_column('financial_goals', 'current_amount', server_default=None, schema='household')

    op.create_table(
        'net_worth_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('accounts_total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('savings_total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('loans_total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('net_worth', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('year_month'),
        schema='household',
    )


def downgrade() -> None:
    op.drop_table('net_worth_snapshots', schema='household')
    op.drop_column('financial_goals', 'current_amount', schema='household')
