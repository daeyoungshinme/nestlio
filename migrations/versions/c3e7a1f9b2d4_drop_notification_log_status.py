"""drop notification_log.status

알림 기록의 status는 항상 "sent"로만 저장되고 읽는 곳이 없었다(dedup·알림함은 존재 여부·sent_at만 본다).
운영 확인(2026-11-13, 읽기 전용): notification_log 64행, 전부 status='sent' — 지워지는 정보가 없다.
downgrade는 칸을 되살리고 기존 행을 'sent'로 채운다.

Revision ID: c3e7a1f9b2d4
Revises: 59fc963aaacf
Create Date: 2026-11-13 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3e7a1f9b2d4"
down_revision: Union[str, None] = "59fc963aaacf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("notification_log", "status", schema="household")


def downgrade() -> None:
    op.add_column(
        "notification_log",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="sent"),
        schema="household",
    )
    op.alter_column("notification_log", "status", server_default=None, schema="household")
