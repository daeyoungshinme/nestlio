"""add_account_loan_to_goal_funding_sources

Revision ID: c7e2a4f6d8b1
Revises: b2d6f4a891c7
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e2a4f6d8b1'
down_revision: Union[str, None] = 'b2d6f4a891c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """목표 연동 대상을 저축/투자상품뿐 아니라 계좌·대출까지 확장한다 — goal_funding_sources가
    savings_product_id/account_id/loan_id 중 정확히 하나만 채워진 폴리모픽 연결 행이 되도록
    savings_product_id를 nullable로 바꾸고 account_id/loan_id 컬럼을 추가한다. 대출은 목표
    현재금액 계산 시 차감된다 (app/services/goal_service.py::compute_current_amount 참고)."""
    op.alter_column(
        'goal_funding_sources', 'savings_product_id', nullable=True, schema='household'
    )
    op.add_column(
        'goal_funding_sources',
        sa.Column('account_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.add_column(
        'goal_funding_sources',
        sa.Column('loan_id', sa.Integer(), nullable=True),
        schema='household',
    )
    op.create_foreign_key(
        'fk_goal_funding_sources_account_id',
        'goal_funding_sources',
        'accounts',
        ['account_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
        ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_goal_funding_sources_loan_id',
        'goal_funding_sources',
        'loans',
        ['loan_id'],
        ['id'],
        source_schema='household',
        referent_schema='household',
        ondelete='CASCADE',
    )
    op.create_unique_constraint(
        'uq_goal_funding_source_account', 'goal_funding_sources', ['goal_id', 'account_id'], schema='household'
    )
    op.create_unique_constraint(
        'uq_goal_funding_source_loan', 'goal_funding_sources', ['goal_id', 'loan_id'], schema='household'
    )
    op.create_check_constraint(
        'ck_goal_funding_source_exactly_one_type',
        'goal_funding_sources',
        "(CASE WHEN savings_product_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN account_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN loan_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
        schema='household',
    )


def downgrade() -> None:
    op.drop_constraint(
        'ck_goal_funding_source_exactly_one_type', 'goal_funding_sources', schema='household', type_='check'
    )
    op.drop_constraint(
        'uq_goal_funding_source_loan', 'goal_funding_sources', schema='household', type_='unique'
    )
    op.drop_constraint(
        'uq_goal_funding_source_account', 'goal_funding_sources', schema='household', type_='unique'
    )
    op.drop_constraint(
        'fk_goal_funding_sources_loan_id', 'goal_funding_sources', schema='household', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_goal_funding_sources_account_id', 'goal_funding_sources', schema='household', type_='foreignkey'
    )
    # 계좌/대출 연동 행은 되돌릴 수 없으므로 삭제한다 (다운그레이드 시 정보 손실).
    op.execute(
        "DELETE FROM household.goal_funding_sources WHERE savings_product_id IS NULL"
    )
    op.drop_column('goal_funding_sources', 'loan_id', schema='household')
    op.drop_column('goal_funding_sources', 'account_id', schema='household')
    op.alter_column(
        'goal_funding_sources', 'savings_product_id', nullable=False, schema='household'
    )
