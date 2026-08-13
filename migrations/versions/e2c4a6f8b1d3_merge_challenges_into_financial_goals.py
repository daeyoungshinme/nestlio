"""merge_challenges_into_financial_goals

Revision ID: e2c4a6f8b1d3
Revises: b1e5f8a4c9d3
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2c4a6f8b1d3'
down_revision: Union[str, None] = 'b1e5f8a4c9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """챌린지(단기 부부 미션)를 재무목표의 한 종류(kind='challenge')로 흡수한다 — 두 모델이
    사실상 부분집합 관계였고(제목/목표금액/진행금액/기간), 축하 알림 로직도 이미
    milestone_service를 공유하고 있어 별도 테이블/화면을 유지할 이유가 없었다."""
    op.add_column(
        'financial_goals',
        sa.Column('kind', sa.String(length=10), nullable=False, server_default='goal'),
        schema='household',
    )
    op.alter_column('financial_goals', 'kind', server_default=None, schema='household')
    op.add_column('financial_goals', sa.Column('description', sa.String(length=500), nullable=True), schema='household')
    op.add_column('financial_goals', sa.Column('start_date', sa.Date(), nullable=True), schema='household')
    op.add_column(
        'financial_goals',
        sa.Column('status', sa.String(length=10), nullable=False, server_default='active'),
        schema='household',
    )
    op.alter_column('financial_goals', 'status', server_default=None, schema='household')
    op.add_column('financial_goals', sa.Column('completed_at', sa.DateTime(), nullable=True), schema='household')
    op.add_column('financial_goals', sa.Column('created_by_id', sa.UUID(), nullable=True), schema='household')
    op.create_foreign_key(
        'financial_goals_created_by_id_fkey',
        'financial_goals',
        'users',
        ['created_by_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
    )

    op.execute(
        """
        INSERT INTO household.financial_goals
            (priority, name, description, target_date, required_amount, monthly_saving_amount,
             current_amount, sort_order, updated_at, kind, start_date, status, completed_at, created_by_id)
        SELECT
            1, title, description, end_date, target_amount, 0,
            current_amount, 999, updated_at, 'challenge', start_date, status, completed_at, created_by_id
        FROM household.challenges
        """
    )
    op.drop_table('challenges', schema='household')


def downgrade() -> None:
    op.create_table(
        'challenges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('target_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('current_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('created_by_id', sa.UUID(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['household.users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        schema='household',
    )
    op.execute(
        """
        INSERT INTO household.challenges
            (title, description, target_amount, current_amount, start_date, end_date, status,
             created_by_id, completed_at, created_at, updated_at)
        SELECT
            name, description, required_amount, current_amount, start_date, target_date, status,
            created_by_id, completed_at, updated_at, updated_at
        FROM household.financial_goals
        WHERE kind = 'challenge' AND start_date IS NOT NULL AND target_date IS NOT NULL AND created_by_id IS NOT NULL
        """
    )
    op.execute("DELETE FROM household.financial_goals WHERE kind = 'challenge'")

    op.drop_constraint('financial_goals_created_by_id_fkey', 'financial_goals', schema='household', type_='foreignkey')
    op.drop_column('financial_goals', 'created_by_id', schema='household')
    op.drop_column('financial_goals', 'completed_at', schema='household')
    op.drop_column('financial_goals', 'status', schema='household')
    op.drop_column('financial_goals', 'start_date', schema='household')
    op.drop_column('financial_goals', 'description', schema='household')
    op.drop_column('financial_goals', 'kind', schema='household')
