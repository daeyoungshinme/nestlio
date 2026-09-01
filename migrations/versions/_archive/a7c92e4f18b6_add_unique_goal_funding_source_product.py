"""add_unique_goal_funding_source_product

Revision ID: a7c92e4f18b6
Revises: f4b8c1d6a3e5
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c92e4f18b6'
down_revision: Union[str, None] = 'f4b8c1d6a3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """저축상품 1개는 최대 1개 목표의 funding source만 될 수 있도록 제약한다 — 목표에 연동된
    상품의 월 계획액을 그 목표의 monthly_saving_amount와 동기화하는데(app/services/goal_service.py::
    _sync_funding_product_monthly_amount), 한 상품이 두 목표에 동시에 연동되면 어느 쪽 값을
    따를지 모호해지기 때문이다. 기존 uq_goal_funding_source는 (goal_id, savings_product_id)라
    같은 상품이 다른 goal_id로 또 연결되는 걸 막지 못해 별도 제약이 필요하다. savings_product_id는
    nullable(계좌/대출 타입 행은 NULL)이라 NULL끼리는 서로 충돌하지 않는다."""
    op.create_unique_constraint(
        'uq_goal_funding_source_savings_product_unique',
        'goal_funding_sources',
        ['savings_product_id'],
        schema='household',
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_goal_funding_source_savings_product_unique',
        'goal_funding_sources',
        schema='household',
        type_='unique',
    )
