"""drop_annual_savings_goals

Revision ID: b8f2a1c9e4d7
Revises: c7e3b9a2d5f1
Create Date: 2026-08-31 00:00:00.000000

편집 가능한 가구 공동 "연간 순저축 목표"(annual_savings_goals)를 제거한다. "얼마를 저축할지"를
표현하는 모델이 5개(FinancialGoal.monthly_saving_amount / challenge / AnnualSavingsGoal /
SavingsProductAnnualPlan / SavingsProduct.monthly_saving_amount)로 중복돼 화면마다 분모가 달랐다.
이제 "올해 저축 계획"은 연간계획(AnnualPlanItem: 계획 수입 − 계획 지출 = 저축 가능액)과
상품별 SavingsProductAnnualPlan로 일원화되고, 개별 목표의 월 요구 적립액은 FinancialGoal의
월별 target이 담당한다.

대응되는 백필 대상 테이블이 없어(저축은 AnnualPlanItem 섹션이 아님) 데이터는 이관 없이 삭제한다
— 도입한 지 얼마 안 된 기능이고, 연간계획 화면에서 같은 정보를 파생값으로 확인할 수 있다.
downgrade는 빈 테이블만 재생성한다.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8f2a1c9e4d7"
down_revision: Union[str, None] = "c7e3b9a2d5f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("annual_savings_goal_monthly_targets", schema="household")
    op.drop_table("annual_savings_goals", schema="household")


def downgrade() -> None:
    op.create_table(
        "annual_savings_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("target_amount_krw", sa.Numeric(14, 2), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year", name="uq_annual_savings_goal_year"),
        schema="household",
    )
    op.create_table(
        "annual_savings_goal_monthly_targets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("goal_id", sa.Integer(), nullable=False),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("target_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["goal_id"], ["household.annual_savings_goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("goal_id", "year_month", name="uq_annual_savings_goal_monthly_target_month"),
        schema="household",
    )
