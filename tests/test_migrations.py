"""마이그레이션 체인 무결성 가드.

운영 배포는 `alembic upgrade head`를 실행하므로(render.yaml), 체인이 깨지면(중복 head,
끊긴 down_revision) 배포가 통째로 실패한다. 이 테스트는 Postgres 없이도 그걸 잡는다.
전체 스키마 재현(모델↔마이그레이션 drift)까지 검증하려면 임시 Postgres가 필요하다 — 별도 과제.
"""
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent


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
