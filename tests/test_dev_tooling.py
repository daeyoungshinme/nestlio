"""개발 도구 핀이 서로 어긋나지 않는지 — dependabot은 requirements*.txt만 올리고 .pre-commit-config.yaml은
건드리지 않아, 둘을 손으로 맞추는 규칙이 조용히 깨진다(pre-commit 훅과 CI의 ruff 규칙 해석이 달라짐).
런타임 버전도 같다: CI는 .python-version/.nvmrc를, Render 배포는 render.yaml env를 읽는다."""

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


def _render_env(key: str) -> str:
    match = re.search(
        rf"- key: {key}\s+value: \"?([^\"\s]+)\"?", (ROOT / "render.yaml").read_text(encoding="utf-8")
    )
    assert match, f"render.yaml에 {key}가 없다"
    return match.group(1)


def test_render_runtime_versions_match_ci_version_files():
    python_version = (ROOT / ".python-version").read_text(encoding="utf-8").strip()
    node_version = (ROOT / ".nvmrc").read_text(encoding="utf-8").strip().removeprefix("v")
    assert _render_env("PYTHON_VERSION") == python_version
    assert _render_env("NODE_VERSION") == node_version


def test_scheduled_workflow_calls_exactly_the_registered_jobs():
    """예약 워크플로가 부르는 `/internal/jobs/{name}`과 `JOB_REGISTRY` 키가 같아야 한다 — 잡 이름을 한쪽만
    바꾸면 운영에서 매일 404가 나는데 CI는 모른다(워크플로는 스케줄로만 돈다)."""
    from app.routers.internal_jobs import JOB_REGISTRY

    workflow = (ROOT / ".github" / "workflows" / "scheduled-jobs.yml").read_text(encoding="utf-8")
    called = set(re.findall(r"/internal/jobs/([a-z0-9-]+)", workflow))
    assert called == set(JOB_REGISTRY), (
        f"워크플로에만: {sorted(called - set(JOB_REGISTRY))}, JOB_REGISTRY에만: {sorted(set(JOB_REGISTRY) - called)}"
    )


def _env_example_keys() -> set[str]:
    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    return set(re.findall(r"^#?\s*([A-Z][A-Z0-9_]*)=", text, re.M))


def test_env_example_keys_are_settings_fields():
    """`.env.example`의 키는 `Settings` 필드여야 한다(TZ는 OS 환경) — 필드 이름을 바꾸고 예시를 안 고치면 그 값이
    조용히 무시된다(`extra="ignore"`)."""
    from app.config import Settings

    fields = {name.upper() for name in Settings.model_fields}
    assert _env_example_keys() - fields - {"TZ"} == set()


def test_string_settings_are_documented_in_env_example():
    """연동·시크릿처럼 문자열인 설정은 전부 `.env.example`에 있어야 한다. 숫자 임계값(코칭·보험 기준 등)은 기본값을
    바꿀 때만 넣으므로 빠져도 된다(루트 CLAUDE.md "환경 변수")."""
    from app.config import _PLACEHOLDERS, _REQUIRED_IN_PROD, Settings

    string_fields = {name for name, field in Settings.model_fields.items() if field.annotation is str}
    expected = {name.upper() for name in string_fields | set(_PLACEHOLDERS) | set(_REQUIRED_IN_PROD)}
    assert expected - _env_example_keys() == set()
