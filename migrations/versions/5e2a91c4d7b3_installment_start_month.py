"""installment_start_month

연간계획 항목에 할부 1회차 달(installment_start_month)을 추가한다 — 회차를 start_month로 계산하면 첫 달을
지우거나 앞 달에 금액을 넣을 때 start_month가 움직여 남은 회차가 전부 재번호됐다("2/5" → "1/5").
기존 할부 항목은 현재 start_month로 채운다(이미 밀린 행은 원래 1회차 달을 알 수 없어 복원하지 않는다).

함께, annual_plan_items의 주 필터(year)와 FK(category_id, recurring_expense_id — 후자는 ON DELETE SET NULL이라
반복거래 삭제 시 테이블 스캔)에 인덱스를 건다.

Revision ID: 5e2a91c4d7b3
Revises: 26cfe94afb14
Create Date: 2026-09-26 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5e2a91c4d7b3"
down_revision: Union[str, None] = "26cfe94afb14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXED_COLUMNS = ("year", "category_id", "recurring_expense_id")


def upgrade() -> None:
    with op.batch_alter_table("annual_plan_items", schema="household") as batch_op:
        batch_op.add_column(sa.Column("installment_start_month", sa.String(length=7), nullable=True))
    op.execute(
        "UPDATE household.annual_plan_items SET installment_start_month = start_month "
        "WHERE installment_total IS NOT NULL"
    )
    for column in _INDEXED_COLUMNS:
        op.create_index(f"ix_household_annual_plan_items_{column}", "annual_plan_items", [column], schema="household")


def downgrade() -> None:
    for column in _INDEXED_COLUMNS:
        op.drop_index(f"ix_household_annual_plan_items_{column}", table_name="annual_plan_items", schema="household")
    with op.batch_alter_table("annual_plan_items", schema="household") as batch_op:
        batch_op.drop_column("installment_start_month")
