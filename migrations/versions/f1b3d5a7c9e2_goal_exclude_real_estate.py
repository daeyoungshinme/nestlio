"""goal_exclude_real_estate

순자산 목표의 "부동산 제외" 옵션 컬럼을 추가하고, 이제 목표 자금원으로 연동할 수 없는 부동산 상품과 그 짝 담보대출
(growlio_account_id를 공유하는 대출) 연동을 지운다(goal_service._apply_funding_sources가 새 연동을 막는다).

Revision ID: f1b3d5a7c9e2
Revises: e9c4b1f7a3d2
Create Date: 2026-11-07 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1b3d5a7c9e2"
down_revision: Union[str, None] = "e9c4b1f7a3d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("financial_goals", schema="household") as batch_op:
        batch_op.add_column(sa.Column("exclude_real_estate", sa.Boolean(), server_default=sa.false(), nullable=False))

    op.execute(
        """
        DELETE FROM household.goal_funding_sources
        WHERE savings_product_id IN (
            SELECT id FROM household.savings_products WHERE product_type = 'real_estate'
        )
        OR loan_id IN (
            SELECT l.id FROM household.loans l
            JOIN household.savings_products p ON p.growlio_account_id = l.growlio_account_id
            WHERE p.product_type = 'real_estate'
        )
        """
    )


def downgrade() -> None:
    # 지운 연동은 되살리지 않는다.
    with op.batch_alter_table("financial_goals", schema="household") as batch_op:
        batch_op.drop_column("exclude_real_estate")
