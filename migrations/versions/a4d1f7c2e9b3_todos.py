"""todos

부부 할일 테이블. app/models/todo.py 참고.

Revision ID: a4d1f7c2e9b3
Revises: b7e3c9a1d4f6
Create Date: 2026-11-03 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "a4d1f7c2e9b3"
down_revision: Union[str, None] = "b7e3c9a1d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "todos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("memo", sa.String(length=1000), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("frequency", sa.String(length=10), nullable=False),
        sa.Column("recurrence_day", sa.Integer(), nullable=True),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("previous_todo_id", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assignee_id"], ["household.users.id"]),
        sa.ForeignKeyConstraint(["completed_by"], ["household.users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["household.users.id"]),
        sa.ForeignKeyConstraint(["previous_todo_id"], ["household.todos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("todos", schema="household")
