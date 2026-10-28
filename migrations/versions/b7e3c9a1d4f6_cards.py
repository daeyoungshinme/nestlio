"""cards

결제카드(신용/체크 + 결제계좌) 테이블과 transactions.card_id. app/models/card.py 참고.

예전에는 카드를 계좌 종류(account_type='card')로 만들었다 — 이런 계좌마다 카드를 하나 만들고(결제계좌 없음,
종류는 그 계좌 지출 중 체크카드가 더 많으면 debit, 아니면 credit) 그 계좌의 거래를 카드로 옮긴다
(card_id 설정, account_id 비움, payment_method는 카드 종류). 원래 계좌는 다른 테이블(goal_funding_sources)이
참조할 수 있어 지우지 않고 비활성화하며, 계좌 종류에서 'card'가 없어지므로 'bank'로 바꾼다.

downgrade는 테이블·컬럼만 지운다. 옮긴 거래의 계좌·비활성화한 계좌는 복구하지 않는다.

Revision ID: b7e3c9a1d4f6
Revises: 9d4e7a1c3b52
Create Date: 2026-10-28 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "b7e3c9a1d4f6"
down_revision: Union[str, None] = "9d4e7a1c3b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("card_type", sa.String(length=10), nullable=False),
        sa.Column("payment_account_id", sa.Integer(), nullable=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["household.users.id"]),
        sa.ForeignKeyConstraint(["payment_account_id"], ["household.accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="household",
    )
    with op.batch_alter_table("transactions", schema="household") as batch_op:
        batch_op.add_column(sa.Column("card_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("transactions_card_id_fkey", "cards", ["card_id"], ["id"], referent_schema="household")
        batch_op.create_index(batch_op.f("ix_household_transactions_card_id"), ["card_id"], unique=False)

    conn = op.get_bind()
    # 앱은 naive datetime을 KST 벽시계로 저장한다(app/utils/dates.py now_kst). KST는 서머타임이 없어 UTC+9 고정.
    now_kst = conn.execute(sa.text("SELECT (now() AT TIME ZONE 'UTC') + interval '9 hours'")).scalar_one()
    card_accounts = conn.execute(
        sa.text(
            """
            SELECT a.id, a.name, a.owner_user_id, a.is_active, a.sort_order,
                   count(*) FILTER (WHERE t.payment_method = 'debit_card') AS debit_count,
                   count(*) FILTER (WHERE t.payment_method = 'credit_card') AS credit_count
            FROM household.accounts a
            LEFT JOIN household.transactions t ON t.account_id = a.id
            WHERE a.account_type = 'card'
            GROUP BY a.id
            ORDER BY a.id
            """
        )
    ).all()
    for account in card_accounts:
        card_type = "debit" if account.debit_count > account.credit_count else "credit"
        card_id = conn.execute(
            sa.text(
                """
                INSERT INTO household.cards
                    (name, card_type, payment_account_id, owner_user_id, is_active, sort_order, created_at, updated_at)
                VALUES (:name, :card_type, NULL, :owner, :active, :sort_order,
                        :now_kst, :now_kst)
                RETURNING id
                """
            ),
            {
                "name": account.name,
                "card_type": card_type,
                "owner": account.owner_user_id,
                "active": account.is_active,
                "sort_order": account.sort_order,
                "now_kst": now_kst,
            },
        ).scalar_one()
        conn.execute(
            sa.text(
                """
                UPDATE household.transactions
                SET card_id = :card_id, account_id = NULL, payment_method = :method
                WHERE account_id = :account_id
                """
            ),
            {"card_id": card_id, "method": f"{card_type}_card", "account_id": account.id},
        )
    conn.execute(
        sa.text(
            """
            UPDATE household.accounts
            SET is_active = false, account_type = 'bank', growlio_account_id = NULL
            WHERE account_type = 'card'
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("transactions", schema="household") as batch_op:
        batch_op.drop_index(batch_op.f("ix_household_transactions_card_id"))
        batch_op.drop_constraint("transactions_card_id_fkey", type_="foreignkey")
        batch_op.drop_column("card_id")
    op.drop_table("cards", schema="household")
