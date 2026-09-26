"""개발 도구 핀이 서로 어긋나지 않는지 — dependabot은 requirements*.txt만 올리고 .pre-commit-config.yaml은
건드리지 않아, 둘을 손으로 맞추는 규칙이 조용히 깨진다(pre-commit 훅과 CI의 ruff 규칙 해석이 달라짐)."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_pre_commit_ruff_rev_matches_requirements_dev_pin():
    pinned = re.search(r"^ruff==(\S+)$", (ROOT / "requirements-dev.txt").read_text(encoding="utf-8"), re.M)
    hook = re.search(
        r"repo: https://github\.com/astral-sh/ruff-pre-commit\s+rev: v(\S+)",
        (ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8"),
    )
    assert pinned and hook
    assert hook.group(1) == pinned.group(1), (
        f".pre-commit-config.yaml ruff rev v{hook.group(1)} != requirements-dev.txt ruff=={pinned.group(1)}"
    )
