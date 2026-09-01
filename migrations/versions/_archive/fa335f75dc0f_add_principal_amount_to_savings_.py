"""add_principal_amount_to_savings_products

Revision ID: fa335f75dc0f
Revises: a1b2c3d4e5f6
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa335f75dc0f'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'savings_products',
        sa.Column('principal_amount', sa.Numeric(14, 2), nullable=True),
        schema='household',
    )


def downgrade() -> None:
    op.drop_column('savings_products', 'principal_amount', schema='household')
