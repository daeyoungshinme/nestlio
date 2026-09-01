"""add_product_type_to_savings_products

Revision ID: 6eb4668e5eb8
Revises: 90692a96997d
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6eb4668e5eb8'
down_revision: Union[str, None] = '90692a96997d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'savings_products',
        sa.Column('product_type', sa.String(10), nullable=False, server_default='savings'),
        schema='household',
    )
    op.execute(
        "UPDATE household.savings_products SET product_type = 'investment' "
        "WHERE name = '펀드, 주식 등 총 투자금액'"
    )


def downgrade() -> None:
    op.drop_column('savings_products', 'product_type', schema='household')
