"""migrate_emergency_fund_to_savings_product

Revision ID: b1e5f8a4c9d3
Revises: d2f8a5c1e9b3
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1e5f8a4c9d3'
down_revision: Union[str, None] = 'd2f8a5c1e9b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """비상금 잔액을 user_settings의 단일 key-value 행에서 savings_products의
    product_type='emergency_fund' 행으로 옮긴다. 기존 값은 가구 공유 설정이었으므로
    owner_user_id는 NULL(공유)로 유지한다."""
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT value FROM household.user_settings WHERE key = 'emergency_fund_balance'")
    ).fetchall()

    if rows:
        print(f"[migrate_emergency_fund_to_savings_product] migrating {len(rows)} emergency fund row(s)")
        op.execute(
            """
            INSERT INTO household.savings_products
                (name, current_balance, monthly_saving_amount, product_type, sort_order, is_active, auto_sync_enabled)
            SELECT '비상금', value::numeric, 0, 'emergency_fund', 0, true, false
            FROM household.user_settings
            WHERE key = 'emergency_fund_balance'
            """
        )
    else:
        print("[migrate_emergency_fund_to_savings_product] no emergency_fund_balance setting found")

    op.execute("DELETE FROM household.user_settings WHERE key = 'emergency_fund_balance'")


def downgrade() -> None:
    # user_settings.user_id는 NOT NULL FK라 원래 누가 저장했는지 복원할 수 없어 되돌릴 수 없다.
    pass
