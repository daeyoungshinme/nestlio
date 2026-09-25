"""0db19c3552b1(월간 계획 → 연간계획 단일화) 데이터 이전 검증.

마이그레이션이 household 스키마와 Postgres 전용 SQL(RETURNING/LEAST/GREATEST)을 쓰므로 SQLite로는
돌릴 수 없어, scripts/check_migration_drift.py처럼 임베디드 PostgreSQL(pgserver)을 띄운다. pgserver가
없는 환경(프로덕션 이미지 등)에서는 건너뛴다. 핵심 불변식: 이전 전 "이번 달 계획" 화면에 보이던 월별
금액(구 list_items_with_annual_fallback 결과)이 이전 후 연간계획의 그 달 금액과 같아야 한다.
"""
import os
import subprocess
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

import pytest

pgserver = pytest.importorskip("pgserver")
sa = pytest.importorskip("sqlalchemy")

ROOT = Path(__file__).resolve().parent.parent
BASELINE = "bdba3c3b3277"
TARGET = "0db19c3552b1"


def _alembic(db_uri: str, *args: str) -> None:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_uri.replace("postgresql://", "postgresql+psycopg2://")
    env["PYTHONPATH"] = str(ROOT)
    r = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=str(ROOT), env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


@pytest.fixture(scope="module")
def pg_uri():
    with tempfile.TemporaryDirectory() as d:
        srv = pgserver.get_server(d)
        try:
            srv.psql("DROP DATABASE IF EXISTS plan_unify WITH (FORCE);")
            srv.psql("CREATE DATABASE plan_unify;")
            srv.psql("\\c plan_unify\nCREATE SCHEMA IF NOT EXISTS household;")
            yield srv.get_uri(database="plan_unify")
        finally:
            srv.cleanup()


SEED = """
INSERT INTO household.users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a@example.com', 'A');
INSERT INTO household.categories (id, name, type, color, is_active, sort_order) VALUES
  (1, '식비', 'variable', '#000', true, 0),
  (2, '주거비', 'fixed', '#000', true, 0),
  (3, '구독', 'fixed', '#000', true, 0);
INSERT INTO household.recurring_expenses
  (id, name, category_id, amount, frequency, start_date, reminder_days_before, next_due_date, is_active)
VALUES (1, '넷플릭스', 3, 17000, 'monthly', '2026-01-01', 0, '2026-10-01', true);
-- 연간 항목 10: 식비 60만/월(1~12월), 그 중 3월은 승격된 월간 행(55만)이 덮어쓴다
INSERT INTO household.annual_plan_items (id, year, section, start_month, end_month, name, category_id, sort_order)
VALUES (10, 2026, 'variable', '2026-01', '2026-12', '식비', 1, 0),
       (11, 2026, 'fixed', '2026-01', '2026-12', '월세', 2, 1);
INSERT INTO household.annual_plan_item_monthly_targets (item_id, year_month, target_amount)
SELECT 10, '2026-' || LPAD(m::text, 2, '0'), 600000 FROM generate_series(1, 12) m;
INSERT INTO household.annual_plan_item_monthly_targets (item_id, year_month, target_amount)
VALUES (11, '2026-01', 1000000);
INSERT INTO household.cashflow_plan_items
  (id, section, year_month, name, amount, category_id, sort_order, annual_plan_item_id,
   installment_no, installment_total, installment_total_amount, recurring_expense_id)
VALUES
  -- 1) 승격된 행 → 연간 10의 3월 target 덮어쓰기
  (1, 'variable', '2026-03', '식비', 550000, 1, 0, 10, NULL, NULL, NULL, NULL),
  -- 2) 연결 없지만 (section, category, name)이 연간 11과 같음 → 연간 11의 2월 target 추가, 기간 유지
  (2, 'fixed', '2026-02', '월세', 1100000, 2, 1, NULL, NULL, NULL, NULL, NULL),
  -- 3) 독립 자유텍스트 항목 두 달 → 새 연간 항목 하나(4,5월)
  (3, 'irregular', '2026-04', '자동차세', 150000, NULL, 2, NULL, NULL, NULL, NULL, NULL),
  (4, 'irregular', '2026-05', '자동차세', 160000, NULL, 2, NULL, NULL, NULL, NULL, NULL),
  -- 4) 할부 3회 → 새 연간 항목 하나(installment 메타 유지)
  (5, 'fixed', '2026-10', '노트북 할부', 333334, NULL, 3, NULL, 1, 3, 1000000, NULL),
  (6, 'fixed', '2026-11', '노트북 할부', 333333, NULL, 3, NULL, 2, 3, 1000000, NULL),
  (7, 'fixed', '2026-12', '노트북 할부', 333333, NULL, 3, NULL, 3, 3, 1000000, NULL),
  -- 5) 반복거래 연동 행(own_amount는 옛 값 15000) → 연동 유지, 금액은 read-through(17000)
  (8, 'fixed', '2026-09', '넷플릭스', 15000, 3, 4, NULL, NULL, NULL, NULL, 1),
  -- 6) 같은 달 같은 키 중복 두 줄 → 합산
  (9, 'variable', '2026-06', '외식', 100000, 1, 5, NULL, NULL, NULL, NULL, NULL),
  (10, 'variable', '2026-06', '외식', 50000, 1, 5, NULL, NULL, NULL, NULL, NULL);
"""


def _targets(conn) -> dict[tuple[str, str], Decimal]:
    rows = conn.execute(
        sa.text(
            "SELECT i.name, t.year_month, "
            "CASE WHEN i.recurring_expense_id IS NOT NULL THEN r.amount ELSE t.target_amount END "
            "FROM household.annual_plan_item_monthly_targets t "
            "JOIN household.annual_plan_items i ON i.id = t.item_id "
            "LEFT JOIN household.recurring_expenses r ON r.id = i.recurring_expense_id"
        )
    ).all()
    return {(name, ym): amount for name, ym, amount in rows}


def test_upgrade_preserves_monthly_amounts_and_downgrade_roundtrips(pg_uri):
    _alembic(pg_uri, "upgrade", BASELINE)
    engine = sa.create_engine(pg_uri.replace("postgresql://", "postgresql+psycopg2://"))
    with engine.begin() as conn:
        conn.execute(sa.text(SEED))

    _alembic(pg_uri, "upgrade", TARGET)
    with engine.begin() as conn:
        assert not conn.execute(
            sa.text("SELECT to_regclass('household.cashflow_plan_items')")
        ).scalar(), "cashflow_plan_items 테이블이 남아 있음"
        targets = _targets(conn)
        # 1) 승격 행이 연간 3월 값을 덮어씀, 나머지 달은 그대로
        assert targets[("식비", "2026-03")] == Decimal("550000")
        assert targets[("식비", "2026-04")] == Decimal("600000")
        # 2) 키 매칭으로 기존 연간 항목에 합류
        assert targets[("월세", "2026-02")] == Decimal("1100000")
        assert targets[("월세", "2026-01")] == Decimal("1000000")
        # 3) 새 항목
        assert targets[("자동차세", "2026-04")] == Decimal("150000")
        assert targets[("자동차세", "2026-05")] == Decimal("160000")
        # 4) 할부 합계 보존
        assert sum(v for (n, _), v in targets.items() if n == "노트북 할부") == Decimal("1000000")
        # 5) 반복거래 연동 read-through
        assert targets[("넷플릭스", "2026-09")] == Decimal("17000")
        # 6) 중복 줄 합산
        assert targets[("외식", "2026-06")] == Decimal("150000")

        items = {
            r.name: r
            for r in conn.execute(
                sa.text(
                    "SELECT name, start_month, end_month, installment_total, installment_total_amount, "
                    "recurring_expense_id FROM household.annual_plan_items"
                )
            )
        }
        assert (items["노트북 할부"].start_month, items["노트북 할부"].end_month) == ("2026-10", "2026-12")
        assert items["노트북 할부"].installment_total == 3
        assert items["넷플릭스"].recurring_expense_id == 1
        assert items["식비"].recurring_expense_id is None
        assert (items["월세"].start_month, items["월세"].end_month) == ("2026-01", "2026-12")

    _alembic(pg_uri, "downgrade", BASELINE)
    with engine.begin() as conn:
        rows = conn.execute(
            sa.text("SELECT name, year_month, amount, installment_no FROM household.cashflow_plan_items")
        ).all()
        by_key = {(r.name, r.year_month): r for r in rows}
        assert by_key[("식비", "2026-03")].amount == Decimal("550000")
        assert by_key[("노트북 할부", "2026-11")].installment_no == 2
        cols = {
            c["name"] for c in sa.inspect(conn).get_columns("annual_plan_items", schema="household")
        }
        assert "recurring_expense_id" not in cols
    engine.dispose()
