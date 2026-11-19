"""growlio_push_queue: server_errors, denied_user_id

아웃박스가 행 하나의 반복 5xx에 큐 전체를 막히거나(server_errors로 따로 세고 상한에서 포기), 공동 상품 행이 계좌
주인이 아닌 배우자 토큰의 403/404로 소진되던(denied_user_id) 문제. 칸 추가만 — 기존 행은 0/NULL로 시작한다.

Revision ID: a6d2f8c4e1b7
Revises: c3e7a1f9b2d4
Create Date: 2026-11-19 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a6d2f8c4e1b7"
down_revision: Union[str, None] = "c3e7a1f9b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "growlio_push_queue",
        sa.Column("server_errors", sa.Integer(), nullable=False, server_default="0"),
        schema="household",
    )
    op.add_column(
        "growlio_push_queue",
        sa.Column("denied_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="household",
    )
    op.create_foreign_key(
        "fk_growlio_push_queue_denied_user_id_users",
        "growlio_push_queue",
        "users",
        ["denied_user_id"],
        ["id"],
        source_schema="household",
        referent_schema="household",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_growlio_push_queue_denied_user_id_users", "growlio_push_queue", schema="household", type_="foreignkey"
    )
    op.drop_column("growlio_push_queue", "denied_user_id", schema="household")
    op.drop_column("growlio_push_queue", "server_errors", schema="household")
