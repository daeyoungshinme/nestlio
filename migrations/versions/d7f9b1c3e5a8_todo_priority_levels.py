"""todo priority levels

할일 "중요" 표시(is_important bool)를 우선순위 4단계(priority: urgent/high/normal/low)로 바꾼다.
기존 중요 할일은 high로 옮긴다(작성 시점 운영 0건 / 전체 7건).

Revision ID: d7f9b1c3e5a8
Revises: c4e6a8b0d2f5
Create Date: 2026-11-12 15:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7f9b1c3e5a8"
down_revision: Union[str, None] = "c4e6a8b0d2f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.add_column(sa.Column("priority", sa.String(length=10), server_default="normal", nullable=False))
    op.execute("UPDATE household.todos SET priority = 'high' WHERE is_important")
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.drop_column("is_important")


def downgrade() -> None:
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.add_column(sa.Column("is_important", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE household.todos SET is_important = true WHERE priority IN ('urgent', 'high')")
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.drop_column("priority")
