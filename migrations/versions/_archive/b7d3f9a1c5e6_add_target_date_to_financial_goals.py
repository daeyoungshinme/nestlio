"""add_target_date_to_financial_goals

Revision ID: b7d3f9a1c5e6
Revises: a1c4e7b2d9f3
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d3f9a1c5e6'
down_revision: Union[str, None] = 'a1c4e7b2d9f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """나이(target_age) 기반 목표일 입력에 더해 날짜 기반(target_date)을 추가한다 — 부부 공동
    목표에서 '나이'는 누구 기준인지 모호하고, 매번 현재 나이를 재입력해야 계산되던 방식을
    오늘 날짜 기준 결정론적 계산으로 보완한다 (app/services/goal_service.py 참고).
    target_age는 하위호환을 위해 그대로 둔다."""
    op.add_column('financial_goals', sa.Column('target_date', sa.Date(), nullable=True), schema='household')


def downgrade() -> None:
    op.drop_column('financial_goals', 'target_date', schema='household')
