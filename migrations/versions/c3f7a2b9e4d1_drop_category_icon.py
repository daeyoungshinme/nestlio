"""drop_category_icon

categories.icon은 어떤 입력 경로(스키마·시드·서비스)로도 채워지지 않아 항상 NULL이었고 프론트도 읽지 않았다.

Revision ID: c3f7a2b9e4d1
Revises: a8c3e1f4b2d6
Create Date: 2026-10-14 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f7a2b9e4d1"
down_revision: Union[str, None] = "a8c3e1f4b2d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("categories", schema="household") as batch_op:
        batch_op.drop_column("icon")


def downgrade() -> None:
    with op.batch_alter_table("categories", schema="household") as batch_op:
        batch_op.add_column(sa.Column("icon", sa.String(length=50), nullable=True))
