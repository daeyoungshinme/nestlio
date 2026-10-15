"""insurance_policies

보험 계약 — 보험 점검(실손 중복·갱신 임박·납입 완료 등)용. app/models/insurance_policy.py 참고.

Revision ID: e5b8d2f1a9c4
Revises: c3f7a2b9e4d1
Create Date: 2026-10-15 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "e5b8d2f1a9c4"
down_revision: Union[str, None] = "c3f7a2b9e4d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insurance_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("insurer", sa.String(length=50), nullable=True),
        sa.Column("policy_type", sa.String(length=20), nullable=False),
        sa.Column("insured_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("insured_name", sa.String(length=30), nullable=True),
        sa.Column("premium_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("payment_frequency", sa.String(length=10), nullable=False),
        sa.Column("is_renewable", sa.Boolean(), nullable=False),
        sa.Column("next_renewal_date", sa.Date(), nullable=True),
        sa.Column("payment_end_date", sa.Date(), nullable=True),
        sa.Column("coverage_end_date", sa.Date(), nullable=True),
        sa.Column("coverages", sa.JSON(), nullable=False),
        sa.Column("recurring_expense_id", sa.Integer(), nullable=True),
        sa.Column("memo", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["insured_user_id"], ["household.users.id"]),
        sa.ForeignKeyConstraint(["recurring_expense_id"], ["household.recurring_expenses.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="household",
    )


def downgrade() -> None:
    op.drop_table("insurance_policies", schema="household")
