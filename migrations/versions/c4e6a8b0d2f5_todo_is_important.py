"""todo is important

할일 "중요" 표시: todos.is_important. 기존 할일은 모두 false라 데이터 이전은 없다.

Revision ID: c4e6a8b0d2f5
Revises: b2d8f4a6c1e3
Create Date: 2026-11-12 14:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b0d2f5"
down_revision: Union[str, None] = "b2d8f4a6c1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.add_column(sa.Column("is_important", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.drop_column("is_important")
