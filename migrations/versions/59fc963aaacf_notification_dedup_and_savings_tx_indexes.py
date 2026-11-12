"""indexes for notification dedup and savings-linked transactions

알림 중복 방지 조회(notification_log: notif_type + year_month + related_id)와 저축상품 연결 거래
(transactions.savings_product_id) 조회에 인덱스를 둔다. 데이터는 바꾸지 않는다.

Revision ID: 59fc963aaacf
Revises: d7f9b1c3e5a8
Create Date: 2026-11-13 10:00:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = "59fc963aaacf"
down_revision: Union[str, None] = "d7f9b1c3e5a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_household_notification_log_dedup",
        "notification_log",
        ["notif_type", "year_month", "related_id"],
        schema="household",
    )
    op.create_index(
        "ix_household_transactions_savings_product_id",
        "transactions",
        ["savings_product_id"],
        schema="household",
    )


def downgrade() -> None:
    op.drop_index("ix_household_transactions_savings_product_id", table_name="transactions", schema="household")
    op.drop_index("ix_household_notification_log_dedup", table_name="notification_log", schema="household")
