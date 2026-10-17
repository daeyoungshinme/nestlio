"""인사이트·점검 결과의 심각도 정렬 — 코칭 인사이트, 소비·보험 점검이 같은 순서(critical → warning → info)로 보여준다."""

_ORDER = {"critical": 0, "warning": 1, "info": 2}


def severity_rank(severity: str) -> int:
    """정렬 키(작을수록 먼저). 모르는 값은 맨 뒤."""
    return _ORDER.get(severity, len(_ORDER))
