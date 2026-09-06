"""마이그레이션 체인 무결성 가드.

운영 배포는 `alembic upgrade head`를 실행하므로(render.yaml), 체인이 깨지면(중복 head,
끊긴 down_revision) 배포가 통째로 실패한다. 이 테스트는 Postgres 없이도 그걸 잡는다.

전체 스키마 재현(구 체인 == 베이스라인, 베이스라인 == 모델)까지 검증하려면 진짜 Postgres가
필요하다 → `scripts/verify_migration_squash.py` (`pip install pgserver` 후 실행). 2026-09-01
스쿼시 시점에 통과 확인.
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


# 2026-09-01 스쿼시 시점에 아카이브된 구 체인 개수. 재스쿼시하면 이 값을 갱신한다.
ARCHIVED_CHAIN_COUNT_AT_SQUASH = 51
SQUASH_BASELINE_REVISION = "bdba3c3b3277"


def test_squash_layout_intact():
    """2026-09-01 스쿼시 이후 versions/ 최상위에는 베이스라인 + 그 뒤로 쌓인 새 리비전만 둔다.
    구 체인은 versions/_archive/ 에 있고 Alembic이 스캔하지 않는다(recursive_version_locations
    미설정). 아카이브가 통째로 사라지거나(스쿼시 무효화) 체인에 딸려 들어오는(head 폭증) 사고,
    베이스라인이 없어지는 사고를 잡는다."""
    top_level = list(VERSIONS_DIR.glob("*.py"))
    archived = list((VERSIONS_DIR / "_archive").glob("*.py"))
    assert len(archived) == ARCHIVED_CHAIN_COUNT_AT_SQUASH, (
        f"아카이브된 구 체인 개수가 {ARCHIVED_CHAIN_COUNT_AT_SQUASH}가 아닙니다: {len(archived)} "
        "(재스쿼시했다면 ARCHIVED_CHAIN_COUNT_AT_SQUASH를 갱신하세요)"
    )
    assert top_level, "versions/ 최상위가 비었습니다 — 베이스라인이 사라졌습니다"
    revs = {r.revision for r in _script_dir().walk_revisions()}
    assert SQUASH_BASELINE_REVISION in revs, f"스쿼시 베이스라인 {SQUASH_BASELINE_REVISION}이 체인에서 사라졌습니다"
    assert not (revs & {"9e12ea51685e", "b8f2a1c9e4d7"}), (
        "아카이브된 구 리비전이 체인에 다시 포함됐습니다 "
        "(alembic.ini의 recursive_version_locations를 켰는지 확인)"
    )
