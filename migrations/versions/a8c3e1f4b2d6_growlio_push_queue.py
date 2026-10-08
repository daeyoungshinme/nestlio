"""growlio_push_queue

저축·투자 거래의 growlio 입출금 반영 아웃박스 — 보내지 못한 동작을 남겨 두고 다음 화면 로드 때 재전송한다
(growlio external_ref 멱등). app/services/growlio_push_service.py 참고.

Revision ID: a8c3e1f4b2d6
Revises: 5e2a91c4d7b3
Create Date: 2026-10-08 15:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "a8c3e1f4b2d6"
down_revision: Union[str, None] = "5e2a91c4d7b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "growlio_push_queue",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("growlio_account_id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("transaction_type", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.String(length=200), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_user_id"], ["household.users.id"], name="fk_growlio_push_queue_owner_user_id_users"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("growlio_push_queue", schema="household")
