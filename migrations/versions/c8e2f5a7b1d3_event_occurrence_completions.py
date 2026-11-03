"""event occurrence completions

반복 일정의 완료를 회차별로 기록한다. app/models/event_occurrence_completion.py 참고.

지금까지 반복 일정의 events.completed_at은 어느 회차를 체크했는지 알 수 없고 전 회차를 완료로 표시했다. 회차로 옮길
근거가 없어 비운다 — 반복 일정은 모두 미완료로 돌아간다. downgrade는 테이블만 지우고 비운 값은 복구하지 않는다.

Revision ID: c8e2f5a7b1d3
Revises: a4d1f7c2e9b3
Create Date: 2026-11-03 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8e2f5a7b1d3"
down_revision: Union[str, None] = "a4d1f7c2e9b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_occurrence_completions",
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["household.events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id", "occurrence_date"),
        schema="household",
    )
    op.execute("UPDATE household.events SET completed_at = NULL WHERE frequency <> 'once'")


def downgrade() -> None:
    op.drop_table("event_occurrence_completions", schema="household")
