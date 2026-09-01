"""add_annual_savings_goal_monthly_targets

Revision ID: d1a4c7e9b2f6
Revises: c3e6a9f1b4d7
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1a4c7e9b2f6'
down_revision: Union[str, None] = 'c3e6a9f1b4d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """가구 공동 연간 저축목표(annual_savings_goals)에 월별 목표금액 테이블을 추가하고,
    기존 target_amount_krw/monthly_target_krw 값을 1~12월 행으로 백필한다. monthly_target_krw가
    있었으면 그 값을 12개월 모두에, 없었으면 target_amount_krw를 12로 균등분배(나머지는 12월에
    몰아줌 — 프론트 utils/monthRange.ts::distributeAmountEvenly와 동일한 반올림 규칙)한다.
    백필 후 target_amount_krw는 매 upsert마다 월별 합계로 재계산되는 파생값이 되고,
    monthly_target_krw 컬럼은 더 이상 직접 입력받지 않으므로 제거한다(응답에서는 모델의
    monthly_target_krw property가 target_amount_krw/12로 대신 계산해 하위호환을 유지한다)."""
    op.create_table(
        'annual_savings_goal_monthly_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('year_month', sa.String(length=7), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['household.annual_savings_goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('goal_id', 'year_month', name='uq_annual_savings_goal_monthly_target_month'),
        schema='household',
    )

    connection = op.get_bind()
    goals = connection.execute(
        sa.text(
            'SELECT id, year, target_amount_krw, monthly_target_krw FROM household.annual_savings_goals'
        )
    ).fetchall()
    monthly_targets_table = sa.table(
        'annual_savings_goal_monthly_targets',
        sa.column('goal_id', sa.Integer()),
        sa.column('year_month', sa.String()),
        sa.column('target_amount', sa.Numeric()),
        schema='household',
    )
    for goal_id, year, target_amount_krw, monthly_target_krw in goals:
        if monthly_target_krw is not None:
            monthly_amounts = [monthly_target_krw] * 12
        else:
            base = (target_amount_krw or 0) // 12
            remainder = (target_amount_krw or 0) - base * 12
            monthly_amounts = [base] * 11 + [base + remainder]
        connection.execute(
            monthly_targets_table.insert(),
            [
                {
                    'goal_id': goal_id,
                    'year_month': f'{year}-{month:02d}',
                    'target_amount': monthly_amounts[month - 1],
                }
                for month in range(1, 13)
            ],
        )

    op.drop_column('annual_savings_goals', 'monthly_target_krw', schema='household')


def downgrade() -> None:
    op.add_column(
        'annual_savings_goals',
        sa.Column('monthly_target_krw', sa.Numeric(precision=12, scale=2), nullable=True),
        schema='household',
    )
    op.drop_table('annual_savings_goal_monthly_targets', schema='household')
