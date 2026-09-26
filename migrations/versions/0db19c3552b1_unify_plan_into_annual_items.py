"""unify_plan_into_annual_items

현금흐름 계획의 원본을 연간계획(annual_plan_items + annual_plan_item_monthly_targets) 하나로 합친다.
구 월간 계획 테이블(cashflow_plan_items)은 조회 시점 폴백으로만 연간계획과 이어져 있어, 한 번 저장된
달은 연간계획과 끊기고 예산 경고·코칭(budget_service)이 연간계획에만 있는 예산을 0으로 보는 문제가 있었다.

데이터 이전 규칙(화면에 보이던 월별 금액을 그대로 보존):
  1. annual_plan_item_id로 승격된 행 → 그 연간 항목의 같은 달 target.
  2. 연결 없는 행 → 같은 해 (section, category_id, name)이 같은 기존 연간 항목의 같은 달 target.
     (구 폴백도 이 키로 연간 값을 가렸으므로 화면에는 행의 값이 보이고 있었다.)
  3. 그래도 없으면 (연도, section, category_id, name, owner, 반복거래, 할부) 단위로 새 연간 항목을 만든다.
  같은 (항목, 달)로 모이는 행들의 금액은 합산해 그 달 합계가 바뀌지 않게 한다. 행이 없는 (항목, 달)의
  기존 target은 그대로 둔다. 반복거래에 연동된 행은 연동 금액(read-through 값)으로 옮기고, 새로 만든 항목이나
  모든 달이 같은 반복거래 행으로만 채워진 기존 항목에만 연동을 옮긴다(그 외 달의 금액이 연동 금액으로
  바뀌지 않도록).

downgrade는 연간 target 하나하나를 annual_plan_item_id가 채워진 월간 행으로 되돌린다(화면상 동일).

Revision ID: 0db19c3552b1
Revises: bdba3c3b3277
Create Date: 2026-09-25 23:50:00

"""
from collections import defaultdict
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0db19c3552b1"
down_revision: Union[str, None] = "bdba3c3b3277"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "household"


def _migrate_rows(conn) -> None:
    rows = conn.execute(
        sa.text(
            f"SELECT id, section, year_month, owner_user_id, name, amount, category_id, sort_order, "
            f"installment_total, installment_total_amount, recurring_expense_id, annual_plan_item_id, updated_by "
            f"FROM {S}.cashflow_plan_items ORDER BY year_month, id"
        )
    ).mappings().all()
    if not rows:
        return
    recurring_amounts = {
        r.id: r.amount for r in conn.execute(sa.text(f"SELECT id, amount FROM {S}.recurring_expenses")).all()
    }
    annual = {
        r["id"]: dict(r)
        for r in conn.execute(
            sa.text(
                f"SELECT id, year, section, category_id, name, start_month, end_month, recurring_expense_id "
                f"FROM {S}.annual_plan_items ORDER BY id"
            )
        ).mappings()
    }
    annual_by_key: dict[tuple, int] = {}
    for item in annual.values():
        annual_by_key.setdefault((item["year"], item["section"], item["category_id"], item["name"]), item["id"])
    existing_months: dict[int, set[str]] = defaultdict(set)
    for r in conn.execute(sa.text(f"SELECT item_id, year_month FROM {S}.annual_plan_item_monthly_targets")).all():
        existing_months[r.item_id].add(r.year_month)

    assigned: dict[tuple[int, str], Decimal] = defaultdict(Decimal)
    recurring_by_item: dict[int, set] = defaultdict(set)
    new_groups: dict[tuple, dict] = {}

    for row in rows:
        ym = row["year_month"]
        year = int(ym[:4])
        rec_id = row["recurring_expense_id"]
        amount = recurring_amounts.get(rec_id, row["amount"]) if rec_id is not None else row["amount"]
        item_id = row["annual_plan_item_id"]
        if item_id is None or item_id not in annual or annual[item_id]["year"] != year:
            item_id = annual_by_key.get((year, row["section"], row["category_id"], row["name"]))
        if item_id is not None:
            assigned[(item_id, ym)] += amount
            recurring_by_item[item_id].add(rec_id)
            continue
        key = (
            year,
            row["section"],
            row["category_id"],
            row["name"],
            row["owner_user_id"],
            rec_id,
            row["installment_total"],
            row["installment_total_amount"],
        )
        group = new_groups.setdefault(
            key, {"sort_order": row["sort_order"], "updated_by": row["updated_by"], "targets": defaultdict(Decimal)}
        )
        group["sort_order"] = min(group["sort_order"], row["sort_order"])
        group["updated_by"] = row["updated_by"] or group["updated_by"]
        group["targets"][ym] += amount

    for (item_id, ym), amount in assigned.items():
        if ym in existing_months[item_id]:
            conn.execute(
                sa.text(
                    f"UPDATE {S}.annual_plan_item_monthly_targets SET target_amount = :a "
                    f"WHERE item_id = :i AND year_month = :ym"
                ),
                {"a": amount, "i": item_id, "ym": ym},
            )
        else:
            conn.execute(
                sa.text(
                    f"INSERT INTO {S}.annual_plan_item_monthly_targets (item_id, year_month, target_amount) "
                    f"VALUES (:i, :ym, :a)"
                ),
                {"a": amount, "i": item_id, "ym": ym},
            )
            existing_months[item_id].add(ym)
    for item_id in {i for i, _ in assigned}:
        months = sorted(existing_months[item_id])
        conn.execute(
            sa.text(
                f"UPDATE {S}.annual_plan_items SET start_month = LEAST(start_month, :s), "
                f"end_month = GREATEST(end_month, :e) WHERE id = :i"
            ),
            {"s": months[0], "e": months[-1], "i": item_id},
        )
        rec_ids = recurring_by_item[item_id]
        covered = {ym for (i, ym) in assigned if i == item_id}
        if (
            annual[item_id]["recurring_expense_id"] is None
            and len(rec_ids) == 1
            and None not in rec_ids
            and covered == existing_months[item_id]
        ):
            conn.execute(
                sa.text(f"UPDATE {S}.annual_plan_items SET recurring_expense_id = :r WHERE id = :i"),
                {"r": next(iter(rec_ids)), "i": item_id},
            )

    for key, group in new_groups.items():
        year, section, category_id, name, owner, rec_id, inst_total, inst_amount = key
        months = sorted(group["targets"])
        new_id = conn.execute(
            sa.text(
                f"INSERT INTO {S}.annual_plan_items (year, section, start_month, end_month, owner_user_id, name, "
                f"category_id, sort_order, installment_total, installment_total_amount, recurring_expense_id, "
                f"updated_by) VALUES (:year, :section, :s, :e, :owner, :name, :cat, :sort, :it, :ia, :rec, :ub) "
                f"RETURNING id"
            ),
            {
                "year": year,
                "section": section,
                "s": months[0],
                "e": months[-1],
                "owner": owner,
                "name": name,
                "cat": category_id,
                "sort": group["sort_order"],
                "it": inst_total,
                "ia": inst_amount,
                "rec": rec_id,
                "ub": group["updated_by"],
            },
        ).scalar_one()
        for ym in months:
            conn.execute(
                sa.text(
                    f"INSERT INTO {S}.annual_plan_item_monthly_targets (item_id, year_month, target_amount) "
                    f"VALUES (:i, :ym, :a)"
                ),
                {"i": new_id, "ym": ym, "a": group["targets"][ym]},
            )


def upgrade() -> None:
    with op.batch_alter_table("annual_plan_items", schema=S) as batch_op:
        batch_op.add_column(sa.Column("installment_total", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("installment_total_amount", sa.Numeric(precision=12, scale=2), nullable=True))
        batch_op.add_column(sa.Column("recurring_expense_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_annual_plan_items_recurring_expense_id",
            "recurring_expenses",
            ["recurring_expense_id"],
            ["id"],
            referent_schema=S,
            ondelete="SET NULL",
        )
    _migrate_rows(op.get_bind())
    op.drop_table("cashflow_plan_items", schema=S)


def downgrade() -> None:
    op.create_table(
        "cashflow_plan_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section", sa.String(length=10), nullable=False),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("installment_no", sa.Integer(), nullable=True),
        sa.Column("installment_total", sa.Integer(), nullable=True),
        sa.Column("installment_total_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("recurring_expense_id", sa.Integer(), nullable=True),
        sa.Column("annual_plan_item_id", sa.Integer(), nullable=True),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["annual_plan_item_id"],
            [f"{S}.annual_plan_items.id"],
            name="fk_cashflow_plan_items_annual_plan_item_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"], [f"{S}.categories.id"], name="fk_cashflow_plan_items_category_id_categories"
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], [f"{S}.users.id"]),
        sa.ForeignKeyConstraint(
            ["recurring_expense_id"],
            [f"{S}.recurring_expenses.id"],
            name="fk_cashflow_plan_items_recurring_expense_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["updated_by"], [f"{S}.users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema=S,
    )
    op.execute(
        f"""
        INSERT INTO {S}.cashflow_plan_items (section, year_month, owner_user_id, name, amount, category_id,
            sort_order, installment_no, installment_total, installment_total_amount, recurring_expense_id,
            annual_plan_item_id, updated_by)
        SELECT i.section, t.year_month, i.owner_user_id, i.name, t.target_amount, i.category_id, i.sort_order,
            CASE WHEN i.installment_total IS NULL THEN NULL ELSE
                (CAST(SUBSTRING(t.year_month, 1, 4) AS INTEGER) - CAST(SUBSTRING(i.start_month, 1, 4) AS INTEGER)) * 12
                + CAST(SUBSTRING(t.year_month, 6, 2) AS INTEGER) - CAST(SUBSTRING(i.start_month, 6, 2) AS INTEGER) + 1
            END,
            i.installment_total, i.installment_total_amount, i.recurring_expense_id, i.id, i.updated_by
        FROM {S}.annual_plan_item_monthly_targets t
        JOIN {S}.annual_plan_items i ON i.id = t.item_id
        """
    )
    with op.batch_alter_table("annual_plan_items", schema=S) as batch_op:
        batch_op.drop_constraint("fk_annual_plan_items_recurring_expense_id", type_="foreignkey")
        batch_op.drop_column("recurring_expense_id")
        batch_op.drop_column("installment_total_amount")
        batch_op.drop_column("installment_total")
