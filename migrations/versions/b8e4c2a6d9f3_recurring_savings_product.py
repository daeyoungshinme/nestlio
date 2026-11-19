"""recurring_expenses.savings_product_id

저축 카테고리 반복거래가 납입할 저축·투자 상품. 자동 생성 거래에 그대로 넘겨 상품 잔액·growlio 반영이 오르게 한다
(전에는 상품 없이 저축 카테고리 지출로만 생겨 잔액이 안 오르고 지출로 집계됐다). 칸 추가만 — 기존 행은 NULL.

Revision ID: b8e4c2a6d9f3
Revises: a6d2f8c4e1b7
Create Date: 2026-11-19 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8e4c2a6d9f3"
down_revision: Union[str, None] = "a6d2f8c4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "recurring_expenses",
        sa.Column("savings_product_id", sa.Integer(), nullable=True),
        schema="household",
    )
    op.create_foreign_key(
        "fk_recurring_expenses_savings_product_id_savings_products",
        "recurring_expenses",
        "savings_products",
        ["savings_product_id"],
        ["id"],
        source_schema="household",
        referent_schema="household",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_recurring_expenses_savings_product_id_savings_products",
        "recurring_expenses",
        schema="household",
        type_="foreignkey",
    )
    op.drop_column("recurring_expenses", "savings_product_id", schema="household")
