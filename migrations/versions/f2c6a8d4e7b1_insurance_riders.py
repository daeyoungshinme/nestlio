"""insurance_riders

보험 특약 — 보장별 가입금액·특약 보험료로 보장 과다·실손형 중복을 특약 단위로 점검한다.
app/models/insurance_rider.py 참고.

Revision ID: f2c6a8d4e7b1
Revises: e5b8d2f1a9c4
Create Date: 2026-10-15 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2c6a8d4e7b1"
down_revision: Union[str, None] = "e5b8d2f1a9c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insurance_riders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("policy_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("coverage", sa.String(length=30), nullable=False),
        sa.Column("coverage_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("premium", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("is_renewable", sa.Boolean(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["policy_id"], ["household.insurance_policies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="household",
    )
    op.create_index(
        op.f("ix_household_insurance_riders_policy_id"), "insurance_riders", ["policy_id"], unique=False, schema="household"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_household_insurance_riders_policy_id"), table_name="insurance_riders", schema="household")
    op.drop_table("insurance_riders", schema="household")
