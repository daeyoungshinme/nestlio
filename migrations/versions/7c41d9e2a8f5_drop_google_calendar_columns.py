"""drop_google_calendar_columns

구글 캘린더 연동(양방향 동기화·가져오기)을 제거하면서 관련 컬럼을 지운다.
- events: google_calendar_event_id, source, dismissed_at
- recurring_expenses: calendar_event_id

가져온 일정(source='google_import')은 일반 일정으로 남기고, 사용자가 목록에서 숨겼던
(dismissed_at이 채워진) 가져온 일정만 삭제한다 — 컬럼이 사라지면 다시 보이게 되기 때문이다.

Revision ID: 7c41d9e2a8f5
Revises: 5e2a91c4d7b3
Create Date: 2026-10-08 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7c41d9e2a8f5"
down_revision: Union[str, None] = "5e2a91c4d7b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM household.events WHERE dismissed_at IS NOT NULL")
    with op.batch_alter_table("events", schema="household") as batch_op:
        batch_op.drop_column("dismissed_at")
        batch_op.drop_column("source")
        batch_op.drop_column("google_calendar_event_id")
    with op.batch_alter_table("recurring_expenses", schema="household") as batch_op:
        batch_op.drop_column("calendar_event_id")


def downgrade() -> None:
    with op.batch_alter_table("recurring_expenses", schema="household") as batch_op:
        batch_op.add_column(sa.Column("calendar_event_id", sa.String(length=255), nullable=True))
    with op.batch_alter_table("events", schema="household") as batch_op:
        batch_op.add_column(sa.Column("google_calendar_event_id", sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column("source", sa.String(length=20), server_default="native", nullable=False)
        )
        batch_op.add_column(sa.Column("dismissed_at", sa.DateTime(), nullable=True))
