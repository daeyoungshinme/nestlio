"""add_real_estate_support

Revision ID: f1a9c5e3b7d2
Revises: c9f4a2b6d8e1
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a9c5e3b7d2'
down_revision: Union[str, None] = 'c9f4a2b6d8e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 'real_estate'(11자)가 들어가도록 savings_products.product_type을 확장한다.
    op.alter_column(
        'savings_products',
        'product_type',
        existing_type=sa.String(10),
        type_=sa.String(20),
        schema='household',
    )
    op.add_column(
        'loans',
        sa.Column('growlio_account_id', sa.String(36), nullable=True),
        schema='household',
    )
    op.add_column(
        'loans',
        sa.Column('auto_sync_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='household',
    )
    op.add_column(
        'loans',
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('loans', 'last_synced_at', schema='household')
    op.drop_column('loans', 'auto_sync_enabled', schema='household')
    op.drop_column('loans', 'growlio_account_id', schema='household')
    op.alter_column(
        'savings_products',
        'product_type',
        existing_type=sa.String(20),
        type_=sa.String(10),
        schema='household',
    )
