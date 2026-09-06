"""모델 ↔ 마이그레이션 드리프트 가드 (CI에서 실행).

`tests/test_migrations.py`는 체인 무결성(head 1개, down_revision 연결, base 1개)만 본다.
컬럼을 추가하고 리비전 생성을 잊어도 그 테스트는 통과하고, 배포(`alembic upgrade head`)
후에야 런타임에서 터진다. 이 스크립트가 그 공백을 메운다:

  1. 임베디드 PostgreSQL(`pgserver`)에 빈 DB를 만들고 `alembic upgrade head`
  2. `alembic revision --autogenerate` 가 비어 있는 마이그레이션을 만드는지 확인
     (= 현재 모델 == 마이그레이션 head)
  3. 하나라도 `op.*` 작업이 나오면 non-zero exit + 그 작업 목록 출력

SQLite로는 대체할 수 없다 — 모델·마이그레이션이 `household` 스키마와 raw SQL을 쓴다.
`scripts/verify_migration_squash.py`(스쿼시 검증 일회성 도구)의 "모델 드리프트" 단계와
같은 로직이지만, 아카이브 체인 재생·왕복 검증 없이 이것만 빠르게 돈다.

    pip install pgserver   # requirements-dev.txt 에 포함
    python scripts/check_migration_drift.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ROOT / "migrations" / "versions"

try:
    import pgserver
except ImportError:
    sys.exit("pgserver가 필요합니다:  pip install pgserver  (requirements-dev.txt)")


def _alembic(db_uri: str, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_uri.replace("postgresql://", "postgresql+psycopg2://")
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(ROOT), env=env, capture_output=True, text=True,
    )


def _drift_ops(probe_body: str) -> list[str]:
    """autogenerate가 만든 리비전 파일의 upgrade() 본문에서 실제 스키마 변경 라인을 추출한다.

    render_as_batch=True 라 변경은 `with op.batch_alter_table(...)` / `batch_op.*` 형태로도
    나온다. `# ###` 주석·빈 줄·`pass` 를 걷어내고, env.py가 항상 넣는 CREATE SCHEMA 는 뺀다.
    남는 게 있으면 드리프트."""
    up = probe_body.split("def upgrade")[1].split("def downgrade")[0]
    ops = []
    for raw in up.splitlines():
        ln = raw.strip()
        if not ln or ln.startswith("#") or ln in ("pass", '"""', "):"):
            continue
        if "CREATE SCHEMA" in ln:
            continue
        if ln.startswith(("op.", "batch_op.", "with op.")):
            ops.append(ln)
    return ops


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        srv = pgserver.get_server(d)
        try:
            root_uri = srv.get_uri()
            base = root_uri.rsplit("/", 1)[0]
            srv.psql("DROP DATABASE IF EXISTS drift_db WITH (FORCE);")
            srv.psql("CREATE DATABASE drift_db;")
            srv.psql("\\c drift_db\nCREATE SCHEMA IF NOT EXISTS household;")
            db_uri = f"{base}/drift_db"

            r = _alembic(db_uri, "upgrade", "head")
            if r.returncode:
                sys.exit(f"alembic upgrade head 실패:\n{r.stderr}")

            probe = _alembic(db_uri, "revision", "--autogenerate", "-m", "_drift_probe")
            generated = list(VERSIONS.glob("*_drift_probe.py"))
            ops: list[str] = []
            try:
                for g in generated:
                    ops += _drift_ops(g.read_text(encoding="utf-8"))
            finally:
                for g in generated:
                    g.unlink()
            if probe.returncode:
                sys.exit(f"alembic revision --autogenerate 실패:\n{probe.stderr}")

            if ops:
                joined = "\n    ".join(ops)
                sys.exit(
                    "[drift] 모델과 마이그레이션 head가 어긋납니다. autogenerate가 만든 작업:\n"
                    f"    {joined}\n\n"
                    "→ `alembic revision --autogenerate -m \"...\"` 로 리비전을 만들고 커밋하세요."
                )
            print("[ok] 모델 == 마이그레이션 head (autogenerate diff 없음)")
        finally:
            srv.cleanup()


if __name__ == "__main__":
    main()
