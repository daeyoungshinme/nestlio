"""마이그레이션 체인 무결성 가드.

운영 배포는 `alembic upgrade head`를 실행하므로(render.yaml), 체인이 깨지면(중복 head,
끊긴 down_revision) 배포가 통째로 실패한다. 이 테스트는 Postgres 없이도 그걸 잡는다.

"모델 == 마이그레이션 head" 검증은 진짜 Postgres가 필요해 CI `migration-drift` 잡
(`scripts/check_migration_drift.py`)이 맡는다.
"""
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
VERSIONS_DIR = REPO_ROOT / "migrations" / "versions"


def _script_dir() -> ScriptDirectory:
    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "migrations"))
    return ScriptDirectory.from_config(cfg)


def test_single_head():
    """머지 커밋 없이 선형 체인이라 head는 항상 정확히 1개여야 한다."""
    heads = _script_dir().get_heads()
    assert len(heads) == 1, f"마이그레이션 head가 여러 개입니다: {heads}"


def test_every_down_revision_resolves():
    script = _script_dir()
    known = {rev.revision for rev in script.walk_revisions()}
    for rev in script.walk_revisions():
        down = rev.down_revision
        parents = down if isinstance(down, (tuple, list)) else [down]
        for parent in parents:
            if parent is None:
                continue
            assert parent in known, f"{rev.revision}의 down_revision {parent!r}이 존재하지 않습니다"


def test_walk_reaches_base():
    """base(down_revision=None)까지 끊김 없이 도달해야 한다."""
    script = _script_dir()
    bases = script.get_bases()
    assert len(bases) == 1, f"base 리비전이 여러 개입니다: {bases}"
    # walk_revisions()가 예외 없이 전체를 순회하면 체인이 연결돼 있다는 뜻.
    count = sum(1 for _ in script.walk_revisions())
    assert count >= 1


SQUASH_BASELINE_REVISION = "bdba3c3b3277"


def test_squash_baseline_intact():
    """2026-09-01 스쿼시 이후 체인은 베이스라인 + 그 뒤로 쌓인 새 리비전뿐이다. 운영 DB가
    이 베이스라인으로 stamp돼 있으므로 베이스라인이 사라지거나, 스쿼시 전 구 리비전(첫/마지막)이
    체인에 다시 들어오는 사고를 잡는다. 구 리비전 파일은 git 히스토리에만 남아 있다."""
    revs = {r.revision for r in _script_dir().walk_revisions()}
    assert SQUASH_BASELINE_REVISION in revs, f"스쿼시 베이스라인 {SQUASH_BASELINE_REVISION}이 체인에서 사라졌습니다"
    assert not (revs & {"9e12ea51685e", "b8f2a1c9e4d7"}), "스쿼시 전 구 리비전이 체인에 다시 포함됐습니다"
