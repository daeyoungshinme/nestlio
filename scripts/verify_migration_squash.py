"""스쿼시된 베이스라인이 아카이브된 구 체인과 스키마상 동일한지, 그리고 현재 모델과
드리프트가 없는지 검증한다.

`tests/conftest.py`가 SQLite로 도는 것과 달리 이 검증은 진짜 PostgreSQL이 필요하다
(마이그레이션에 `household.` 스키마와 raw SQL이 있어 SQLite로 대체 불가). 임베디드
Postgres(`pgserver`)를 쓰므로 로컬에 Postgres/Docker를 깔 필요는 없다:

    pip install pgserver
    .venv/Scripts/python.exe scripts/verify_migration_squash.py

하는 일:
  1. 임시 PG DB A: 아카이브된 51개 체인을 전부 적용 → `pg_dump --schema-only`
  2. 임시 PG DB B: 스쿼시 베이스라인만 적용 → `pg_dump --schema-only`
  3. A와 B의 스키마 오브젝트(테이블/컬럼/인덱스/제약)가 완전히 일치하는지 비교
     (CREATE TABLE 안의 컬럼 순서 차이는 무시 — Postgres에서 의미 없음)
  4. 베이스라인 DB에서 `alembic revision --autogenerate` 가 빈 마이그레이션을 만드는지
     (= 베이스라인 ≡ 현재 모델)
  5. upgrade → downgrade → upgrade 왕복

구 체인의 데이터 백필 마이그레이션(`op.execute`)은 빈 DB에서 0행을 건드리므로 스키마
비교에는 영향이 없다.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ROOT / "migrations" / "versions"
ARCHIVE = VERSIONS / "_archive"

try:
    import pgserver
except ImportError:
    sys.exit("pgserver가 필요합니다:  pip install pgserver")

PG_BIN = Path(pgserver.__file__).parent / "pginstall" / "bin"


def _alembic(db_uri: str, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["DATABASE_URL"] = db_uri.replace("postgresql://", "postgresql+psycopg2://")
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(ROOT), env=env, capture_output=True, text=True,
    )


def _pg_dump(db_uri: str) -> str:
    r = subprocess.run(
        [str(PG_BIN / "pg_dump"), "--schema-only", "--no-owner", "--no-privileges",
         "--schema=household", db_uri],
        capture_output=True, text=True,
    )
    if r.returncode:
        sys.exit(f"pg_dump 실패:\n{r.stderr}")
    return r.stdout


def _objects(dump: str) -> dict[tuple[str, str], object]:
    """pg_dump 출력을 {(종류, 이름): 정규화된 DDL} 로. 테이블은 컬럼 순서 무시."""
    stmts, buf = [], []
    for ln in dump.splitlines():
        if ln.startswith("--") or ln.startswith("SET ") or not ln.strip():
            continue
        buf.append(ln)
        if ln.rstrip().endswith(";"):
            stmts.append(" ".join(buf))
            buf = []
    objs: dict[tuple[str, str], object] = {}
    for s in stmts:
        s = re.sub(r"\s+", " ", s).strip()
        if s.startswith(("SELECT", "CREATE SCHEMA", "ALTER SCHEMA", "COMMENT ON SCHEMA")):
            continue
        m = re.match(r"CREATE TABLE (household\.\w+) \((.*)\);", s)
        if m:
            cols, depth, cur = {}, 0, ""
            for ch in m.group(2):
                if ch == "," and depth == 0:
                    p = cur.strip().split(None, 1)
                    if p:
                        cols[p[0]] = p[1] if len(p) > 1 else ""
                    cur = ""
                else:
                    depth += ch == "("
                    depth -= ch == ")"
                    cur += ch
            p = cur.strip().split(None, 1)
            if p:
                cols[p[0]] = p[1] if len(p) > 1 else ""
            objs[("table", m.group(1))] = {
                k: v.replace("::character varying", "") for k, v in cols.items()
            }
            continue
        m = re.match(r"CREATE (?:UNIQUE )?INDEX (\S+) ", s)
        if m:
            objs[("index", m.group(1))] = s
            continue
        m = re.search(r"ADD CONSTRAINT (\S+) ", s)
        if m:
            objs[("constraint", m.group(1))] = re.sub(r"ALTER TABLE ONLY \S+ ", "", s)
    return objs


def main() -> None:
    archived = sorted(p.name for p in ARCHIVE.glob("*.py"))
    baseline = sorted(p.name for p in VERSIONS.glob("*.py"))
    print(f"아카이브 {len(archived)}개, 베이스라인 {len(baseline)}개 ({', '.join(baseline)})")
    if len(baseline) != 1:
        sys.exit("versions/ 최상위에는 베이스라인 1개만 있어야 합니다")

    with tempfile.TemporaryDirectory() as d:
        srv = pgserver.get_server(d)
        try:
            root_uri = srv.get_uri()
            base = root_uri.rsplit("/", 1)[0]

            def fresh(name: str) -> str:
                srv.psql(f"DROP DATABASE IF EXISTS {name} WITH (FORCE);")
                srv.psql(f"CREATE DATABASE {name};")
                srv.psql(f"\\c {name}\nCREATE SCHEMA IF NOT EXISTS household;")
                return f"{base}/{name}"

            # 1) 구 체인 (아카이브를 versions/ 로 잠시 복사)
            copied = []
            for p in ARCHIVE.glob("*.py"):
                dst = VERSIONS / p.name
                dst.write_bytes(p.read_bytes())
                copied.append(dst)
            try:
                (VERSIONS / baseline[0]).rename(VERSIONS / (baseline[0] + ".bak"))
                chain_uri = fresh("chain_db")
                r = _alembic(chain_uri, "upgrade", "head")
                if r.returncode:
                    sys.exit(f"구 체인 upgrade 실패:\n{r.stderr}")
                chain_dump = _pg_dump(chain_uri)
            finally:
                for p in copied:
                    p.unlink()
                (VERSIONS / (baseline[0] + ".bak")).rename(VERSIONS / baseline[0])

            # 2) 베이스라인만
            base_uri = fresh("base_db")
            r = _alembic(base_uri, "upgrade", "head")
            if r.returncode:
                sys.exit(f"베이스라인 upgrade 실패:\n{r.stderr}")
            base_dump = _pg_dump(base_uri)

            # 3) 비교
            ca, cb = _objects(chain_dump), _objects(base_dump)
            problems = []
            for k in sorted(set(ca) - set(cb)):
                problems.append(f"체인에만 있음: {k}")
            for k in sorted(set(cb) - set(ca)):
                problems.append(f"베이스라인에만 있음: {k}")
            for k in sorted(set(ca) & set(cb)):
                if k[0] == "table":
                    for col in set(ca[k]) | set(cb[k]):
                        if ca[k].get(col) != cb[k].get(col):
                            problems.append(
                                f"{k[1]}.{col}: 체인={ca[k].get(col)!r} 베이스라인={cb[k].get(col)!r}"
                            )
                elif ca[k] != cb[k]:
                    problems.append(f"{k}: DDL 불일치\n  체인:       {ca[k]}\n  베이스라인: {cb[k]}")
            if problems:
                print("\n".join(problems))
                sys.exit(f"\n✗ 스키마 불일치 {len(problems)}건")
            print(f"✓ 구 체인 == 베이스라인 (테이블 {sum(1 for k in ca if k[0]=='table')}개, "
                  f"인덱스 {sum(1 for k in ca if k[0]=='index')}개, "
                  f"제약 {sum(1 for k in ca if k[0]=='constraint')}개)")

            # 4) 모델 드리프트
            probe = _alembic(base_uri, "revision", "--autogenerate", "-m", "_drift_probe")
            gen = list(VERSIONS.glob("*_drift_probe.py"))
            drift = ""
            for g in gen:
                body = g.read_text(encoding="utf-8")
                up = body.split("def upgrade")[1].split("def downgrade")[0]
                ops = [ln.strip() for ln in up.splitlines()
                       if ln.strip().startswith("op.") and "op.execute(\"CREATE SCHEMA" not in ln]
                drift = "\n    ".join(ops)
                g.unlink()
            if probe.returncode:
                sys.exit(f"autogenerate 실패:\n{probe.stderr}")
            if drift:
                sys.exit(f"✗ 베이스라인 ≠ 모델, autogenerate가 뽑은 작업:\n    {drift}")
            print("✓ 베이스라인 == 현재 모델 (autogenerate diff 없음)")

            # 5) 왕복
            rt = fresh("rt_db")
            for step in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
                r = _alembic(rt, *step)
                if r.returncode:
                    sys.exit(f"왕복 {step} 실패:\n{r.stderr}")
            print("✓ upgrade → downgrade → upgrade 왕복 정상")
            print("\n전부 통과.")
        finally:
            srv.cleanup()


if __name__ == "__main__":
    main()
