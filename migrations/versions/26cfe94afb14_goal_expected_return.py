"""goal_expected_return

재무목표에 기대 연수익률(%) 컬럼을 추가한다 — 복리 기준 예상 달성월 계산용(nullable, 기존 행은 NULL = 선형 ETA만).

Revision ID: 26cfe94afb14
Revises: 0db19c3552b1
Create Date: 2026-09-26 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "26cfe94afb14"
down_revision: Union[str, None] = "0db19c3552b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("financial_goals", schema="household") as batch_op:
        batch_op.add_column(sa.Column("expected_annual_return_pct", sa.Numeric(precision=5, scale=2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("financial_goals", schema="household") as batch_op:
        batch_op.drop_column("expected_annual_return_pct")
