"""todo each completes

"각자 완료" 할일: todos.each_completes 플래그와 사람별 체크 테이블 todo_completions.
app/models/todo_completion.py 참고. 기존 할일은 모두 false(지금처럼 한 명이 체크하면 완료)라 데이터 이전은 없다.

Revision ID: b2d8f4a6c1e3
Revises: f1b3d5a7c9e2
Create Date: 2026-11-12 11:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2d8f4a6c1e3"
down_revision: Union[str, None] = "f1b3d5a7c9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.add_column(sa.Column("each_completes", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        "todo_completions",
        sa.Column("todo_id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["todo_id"], ["household.todos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["household.users.id"]),
        sa.PrimaryKeyConstraint("todo_id", "user_id"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("todo_completions", schema="household")
    with op.batch_alter_table("todos", schema="household") as batch_op:
        batch_op.drop_column("each_completes")
