"""accounts·savings_products·loans: 활성 growlio 연결 유니크(부분 인덱스)

가져오기를 연타하거나 두 탭에서 동시에 누르면 서비스의 사전 검사(already_linked_growlio_ids)를 둘 다 통과해 같은
growlio 계좌가 활성 행 둘에 연결됐다 — 잔액이 순자산에 두 번 잡히고 입출금도 두 번 나간다.
운영 확인(2026-11-19, 읽기 전용): 세 테이블 모두 활성 중복 0건 — 인덱스 생성이 실패하지 않는다.

Revision ID: c5f1a9d3e7b2
Revises: b8e4c2a6d9f3
Create Date: 2026-11-19 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5f1a9d3e7b2"
down_revision: Union[str, None] = "b8e4c2a6d9f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("accounts", "savings_products", "loans")
_WHERE = sa.text("is_active AND growlio_account_id IS NOT NULL")


def upgrade() -> None:
    for table in _TABLES:
        op.create_index(
            f"uq_{table}_active_growlio_account_id",
            table,
            ["growlio_account_id"],
            unique=True,
            schema="household",
            postgresql_where=_WHERE,
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"uq_{table}_active_growlio_account_id", table_name=table, schema="household")
