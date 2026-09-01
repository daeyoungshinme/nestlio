"""backfill_linked_plan_item_drift

Revision ID: fa678a79e65f
Revises: 93cae711c8c5
Create Date: 2026-08-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa678a79e65f'
down_revision: Union[str, None] = '93cae711c8c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """반복거래에 연동된(recurring_expense_id IS NOT NULL) 계획 항목은 이제 조회 시 항상 연동된 RecurringExpense의
    금액/카테고리를 read-through로 보여준다(app/models/cashflow_plan_item.py의 amount/category_id 프로퍼티 참고).
    하지만 저장된 amount/category_id 컬럼 자체는 여전히 연결 해제(SET NULL) 시의 fallback 값으로 남아있는데,
    지금까지는 연결 후 반복거래 금액이 바뀌어도 이 fallback이 갱신되지 않았다(생성 시점 1회 복사). 연결 해제 시
    엉뚱하게 오래된 금액으로 되돌아가지 않도록, 지금 드리프트된(반복거래와 어긋난) 행을 최신 값으로 맞춰둔다.
    사용자 모르게 조용히 바뀌지 않도록 적용 전 드리프트 내역을 먼저 리포트한다."""
    bind = op.get_bind()
    drifted = bind.execute(
        sa.text(
            """
            SELECT i.id, i.name, i.year_month,
                   i.amount AS item_amount, r.amount AS recurring_amount,
                   i.category_id AS item_category_id, r.category_id AS recurring_category_id
            FROM household.cashflow_plan_items i
            JOIN household.recurring_expenses r ON r.id = i.recurring_expense_id
            WHERE i.recurring_expense_id IS NOT NULL
              AND (i.amount <> r.amount OR i.category_id IS DISTINCT FROM r.category_id)
            ORDER BY i.year_month, i.id
            """
        )
    ).fetchall()

    if drifted:
        print(
            f"[backfill_linked_plan_item_drift] {len(drifted)} linked plan item(s) drifted from their "
            "recurring expense and will be synced:"
        )
        for row in drifted:
            print(
                f"  item#{row.id} [{row.year_month}] '{row.name}': "
                f"amount {row.item_amount} -> {row.recurring_amount}, "
                f"category_id {row.item_category_id} -> {row.recurring_category_id}"
            )
    else:
        print("[backfill_linked_plan_item_drift] no drifted rows found.")

    op.execute(
        """
        UPDATE household.cashflow_plan_items i
        SET amount = r.amount, category_id = r.category_id
        FROM household.recurring_expenses r
        WHERE r.id = i.recurring_expense_id
          AND (i.amount <> r.amount OR i.category_id IS DISTINCT FROM r.category_id)
        """
    )


def downgrade() -> None:
    # 데이터 백필일 뿐 스키마 변경이 없고, 백필 전 드리프트 값은 기록해두지 않으므로 되돌릴 수 없다.
    pass
