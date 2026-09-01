"""drop_stale_category_month_unique_index

Revision ID: 93cae711c8c5
Revises: 7a4f2c8e91b5
Create Date: 2026-08-06 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93cae711c8c5'
down_revision: Union[str, None] = '7a4f2c8e91b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """uq_cashflow_plan_items_category_month(62fb374dabb8)는 구 budgets 테이블의 "카테고리당 1행"
    제약을 그대로 옮겨온 것이지만, budget_service.get_budgets_for_month는 이미 한 카테고리에 여러 계획
    항목이 태깅되는 것을 전제로 그 금액을 합산한다(예: 서로 다른 구독 두 개가 같은 "구독" 카테고리에
    태깅). 이 DB 전용 인덱스는 SQLAlchemy 모델에 선언돼 있지 않아(순수 마이그레이션 SQL) 테스트(SQLite)에는
    전혀 걸리지 않다가, 반복거래 두 개가 같은 카테고리로 같은 달에 연결된 실제 데이터에서 처음 위반이
    발생했다 — 다음 마이그레이션(fa678a79e65f)이 그 드리프트를 정리하려다 막힌 원인."""
    op.drop_index('uq_cashflow_plan_items_category_month', table_name='cashflow_plan_items', schema='household')


def downgrade() -> None:
    op.create_index(
        'uq_cashflow_plan_items_category_month',
        'cashflow_plan_items',
        ['category_id', 'year_month'],
        unique=True,
        schema='household',
        postgresql_where=sa.text('category_id IS NOT NULL'),
    )
